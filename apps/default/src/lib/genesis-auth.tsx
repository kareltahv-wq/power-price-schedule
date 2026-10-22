import { ErrorResponse, ErrorTimeout, UserManager, type User } from 'oidc-client-ts';
import * as React from 'react';
import { AuthContext, AuthProvider, useAuth, type AuthContextProps } from 'react-oidc-context';

import { GatewayAuthSync } from './gateway-auth';

/** Query params the IdP appends to `redirect_uri` on the way back. */
const OIDC_CALLBACK_PARAMS = ['code', 'state', 'session_state', 'iss'];

/**
 * An in-app path (`/admin?tab=2#top`) is safe to return to after sign-in; a
 * destination taken from a query parameter is not. Only a single leading `/`
 * qualifies: `//host` and `/\host` are protocol-relative and would leave the
 * app, and anything with a scheme is refused by the same rule.
 */
export function isSafeAppPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  );
}

/** The path the OIDC `state` carries through the sign-in round trip. */
type SigninState = { returnTo: string };

/**
 * Where a sign-in started, minus any stale callback params, so a sign-in
 * clicked on a not-yet-cleaned callback URL does not carry them back.
 */
function currentAppPath(): string {
  const url = new URL(window.location.href);
  for (const name of OIDC_CALLBACK_PARAMS) {
    url.searchParams.delete(name);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The in-app path a completed sign-in should land on, read off the round
 * tripped OIDC `state`, or null when there is none worth honouring.
 */
export function readReturnTo(state: unknown): string | null {
  if (typeof state !== 'object' || state == null) {
    return null;
  }
  const { returnTo } = state as Partial<SigninState>;
  return isSafeAppPath(returnTo) ? returnTo : null;
}

/**
 * The URL the app should show once the auth code has been exchanged:
 * `current` with the OIDC callback params dropped, moved to `returnTo` when
 * the sign-in carried one. Pure, so it can be tested without a browser.
 */
export function signinLandingUrl(current: URL, returnTo: string | null): URL {
  const url = new URL(current.href);
  for (const name of OIDC_CALLBACK_PARAMS) {
    url.searchParams.delete(name);
  }
  if (returnTo != null) {
    const target = new URL(returnTo, url.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    url.hash = target.hash;
  }
  return url;
}

/**
 * Finish the sign-in on the page the user started from.
 *
 * Two jobs, both on the URL. First, drop the OIDC callback params once the
 * auth code has been exchanged: `react-oidc-context` exchanges `?code=&state=`
 * on mount but leaves them in the URL, and the PKCE state it matched them
 * against is deleted during that exchange, so any later mount of the same URL
 * (reload, back navigation, a shared link) would retry the callback, find no
 * matching state, and surface an auth error that hides a valid session. Other
 * params (e.g. the preview `accessToken`) and the hash are kept.
 *
 * Second, return to where the sign-in began. `redirect_uri` is the app root,
 * so every sign-in used to land on `/`, whatever the user was trying to reach
 * (#28786: an owner signing in for `/admin` landed on the public page with no
 * path onward, and apps compensated with a `sessionStorage` flag written by
 * exactly one button). The path now rides in the OIDC `state`, which
 * `signinRedirect` below fills in for every entry point. `replaceState` alone
 * is invisible to React Router, which reads the location on `popstate`, so
 * one is dispatched when the path moved.
 */
function onSigninCallback(user: User | undefined): void {
  const current = new URL(window.location.href);
  const next = signinLandingUrl(current, readReturnTo(user?.state));
  if (next.href === current.href) {
    return;
  }
  const pathMoved =
    next.pathname !== current.pathname ||
    next.search !== current.search ||
    next.hash !== current.hash;
  window.history.replaceState(window.history.state, document.title, next.toString());
  if (pathMoved) {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }
}

/**
 * Process-wide singletons, deliberately outside React.
 *
 * `main.tsx`'s ThemeGate renders the app bare on its first pass and re-renders
 * it wrapped in a next-themes provider once a layout effect confirms the app
 * did not bring its own. That moves the whole tree one level deeper, so React
 * unmounts and remounts it - `App`, `GenesisAuth` and `AuthProvider` included.
 *
 * `AuthProvider` guards its callback with a per-instance ref, so the remounted
 * instance runs `signinCallback()` again. On the first landing after sign-in
 * the URL still legitimately carries `?code=`, and the backend consumes auth
 * codes with GETDEL (single-use by design), so that second exchange fails and
 * latches an auth error over an otherwise valid, already-stored session - the
 * user sees "Sign-in could not be completed" until they refresh by hand.
 *
 * Keeping the `UserManager` here, and memoizing the in-flight exchange on it,
 * makes the second mount await the SAME exchange instead of starting a rival
 * one. This is correct independently of the remount: an auth code is
 * single-use, so two concurrent exchanges of one code are never valid.
 */
let cachedUserManager: UserManager | null = null;
let inflightSigninCallback: Promise<User | undefined> | null = null;
/** One silent sign-in attempt per page load, remounts included (see above). */
let silentSigninAttempted = false;

function getUserManager(): UserManager {
  if (cachedUserManager != null) {
    return cachedUserManager;
  }
  const origin = window.location.origin;
  const manager = new UserManager({
    authority: `${origin}/_genesis/auth`,
    client_id: 'default',
    redirect_uri: `${origin}/`,
    scope: 'openid profile email',
  });

  // Memoize the exchange itself rather than guarding at the call site: the
  // remount happens in a layout effect, long before the first exchange's
  // network round-trip resolves, so a "have we finished?" flag would still be
  // false and the second mount would race a second redemption.
  const signinCallback = manager.signinCallback.bind(manager);
  manager.signinCallback = (url?: string): Promise<User | undefined> => {
    inflightSigninCallback ??= signinCallback(url);
    return inflightSigninCallback;
  };

  // Every sign-in remembers where it started (see `onSigninCallback`), from
  // whichever button or gate triggered it. A caller's own `state` wins.
  const signinRedirect = manager.signinRedirect.bind(manager);
  manager.signinRedirect = (args = {}): Promise<void> => {
    const state: SigninState | unknown =
      args.state === undefined ? { returnTo: currentAppPath() } : args.state;
    return signinRedirect({ ...args, state });
  };

  cachedUserManager = manager;
  return manager;
}

/**
 * Pre-built Genesis OIDC auth wrapper.
 *
 * Points at the app's own realm under `/_genesis/auth`, which serves the
 * discovery document every other endpoint is derived from.
 *
 * Usage in App.tsx:
 * ```tsx
 * import { GenesisAuth } from '@/lib/genesis-auth';
 *
 * function App() {
 *   return (
 *     <GenesisAuth>
 *       <ProtectedApp />
 *     </GenesisAuth>
 *   );
 * }
 * ```
 *
 * Access user profile after login:
 * ```tsx
 * import { useAuth } from 'react-oidc-context';
 *
 * function Profile() {
 *   const auth = useAuth();
 *   const { email, name, preferred_username, sub } = auth.user?.profile ?? {};
 *   // ...
 * }
 * ```
 *
 * Roles: `useGenesisRole()` and `<RequireRole role="admin">` below.
 *
 * `auth.signinRedirect()` brings the user back to the page it was called from
 * (path, query and hash), so a gate on `/admin` needs no return flag of its own.
 */
export function GenesisAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider userManager={getUserManager()} onSigninCallback={onSigninCallback}>
      {/* Forwards the signed-in user's id_token to the data gateway (row scoping). */}
      <GatewayAuthSync />
      <SessionRenewal />
      <HideSignedOutError>{children}</HideSignedOutError>
    </AuthProvider>
  );
}

/**
 * True when the silent sign-in at mount found no session (the realm answers
 * only `login_required`) or timed out (F261), and when a renewal found no
 * session (`login_required`, after which `SessionRenewal` signs the user out).
 * Every other error reaches the app.
 */
export function isSignedOutError(error: AuthContextProps['error']): boolean {
  const inner = error?.innerError;
  if (error?.source === 'renewSilent') {
    return isNoSessionRenewError(inner);
  }
  if (error?.source !== 'signinSilent') {
    return false;
  }
  return (
    inner instanceof ErrorTimeout ||
    (inner instanceof ErrorResponse && inner.error === 'login_required')
  );
}

/**
 * True when a renewal can never succeed, so the stored user is dead and the
 * app must show the signed-out state:
 *  - `invalid_grant`: the refresh was refused (the chain was revoked,
 *    replayed or expired, or the account was disabled).
 *  - `login_required`: the auth server has no session for the user any more.
 *    A session with no refresh token renews this way, for example the editor
 *    preview, which signs the builder in for each renewal and refuses a
 *    builder who left the workspace.
 * A timeout or a 5xx is not in the list: the library retries those itself.
 */
export function isNoSessionRenewError(error: unknown): error is ErrorResponse {
  return (
    error instanceof ErrorResponse &&
    (error.error === 'invalid_grant' || error.error === 'login_required')
  );
}

/**
 * Re-provides the auth context without that error, because the library keeps
 * it in `auth.error` and has no call that clears it.
 */
function HideSignedOutError({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const value = React.useMemo(
    () => (isSignedOutError(auth.error) ? { ...auth, error: undefined } : auth),
    [auth],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Keeps a signed-in user signed in (#26083). Renders nothing.
 *
 * Token renewal itself needs no code here: the auth server now hands out a
 * refresh token and `oidc-client-ts` uses it automatically before the
 * 15-minute access token expires. Two gaps remain that the library leaves to
 * the app:
 *
 *  1. A new tab (or a reload after the tab's sessionStorage is gone) starts
 *     with no stored user, and nothing in `react-oidc-context` tries to sign
 *     in silently on mount. The auth server keeps a session cookie for this
 *     app, so ONE `signinSilent()` attempt at mount signs the user back in
 *     without the login form. `login_required` (no session) is the normal
 *     signed-out state. `HideSignedOutError` keeps it out of `auth.error`, so
 *     the app's own sign-in button remains the visible path.
 *  2. When a renewal is refused (`isNoSessionRenewError`: `invalid_grant` or
 *     `login_required`) the library raises `silentRenewError` but leaves
 *     `isAuthenticated` true with a dead token, so the app keeps showing the
 *     signed-in screens (an Admin page included) until a reload. Dropping the
 *     user here flips the app to signed-out so it shows sign-in instead of
 *     failing every gateway call with 401 until a manual refresh.
 *     Timeouts and 5xx are left alone: the library retries those itself.
 */
function SessionRenewal(): null {
  const auth = useAuth();
  const { events, removeUser, signinSilent, isLoading, user } = auth;

  React.useEffect(() => {
    if (silentSigninAttempted || isLoading || user != null) {
      return;
    }
    const url = new URL(window.location.href);
    if (OIDC_CALLBACK_PARAMS.some((name) => url.searchParams.has(name))) {
      // A callback is in flight; AuthProvider is exchanging the code.
      return;
    }
    silentSigninAttempted = true;
    signinSilent().catch(() => {
      // login_required, timeout, or an auth server without sessions: signed out.
      // The context wrapper resolves null instead and stores the failure in
      // `auth.error`, where `HideSignedOutError` hides a signed-out answer.
    });
  }, [isLoading, user, signinSilent]);

  React.useEffect(() => {
    return events.addSilentRenewError((error) => {
      if (!isNoSessionRenewError(error)) {
        return;
      }
      if (error.error === 'login_required') {
        // The auth server just said it has no session, so the one silent
        // sign-in above would get the same answer: show signed-out at once.
        // After `invalid_grant` that attempt still runs, because a live
        // session can outlast a dead refresh token.
        silentSigninAttempted = true;
      }
      void removeUser();
    });
  }, [events, removeUser]);

  return null;
}

// ---------------------------------------------------------------------------
// Roles: the owner makes an app user an Admin or a Member in App Users
// ---------------------------------------------------------------------------

/** What an app user can see. The app's owner sets it, and nobody sets their own. */
export type GenesisRole = 'admin' | 'member';

/**
 * The signed-in app user's role, or null while signed out or loading. A token
 * without a role claim (every account the owner has not made an admin, and
 * every token from before roles) is a member. Safe outside `<GenesisAuth>`
 * (always null there).
 *
 * The role comes from the sign-in token, and it decides what the app SHOWS. It
 * is not a server permission: project data is not filtered by role yet. A role
 * change reaches a signed-in user within 15 minutes.
 */
export function useGenesisRole(): GenesisRole | null {
  const auth = React.useContext(AuthContext);
  if (auth == null || !auth.isAuthenticated) {
    return null;
  }
  return (auth.user?.profile as { role?: unknown } | undefined)?.role === 'admin'
    ? 'admin'
    : 'member';
}

/**
 * Shows `children` only to a signed-in app user with `role`. A member page
 * (`role="member"`) admits every signed-in user, an admin page only admins.
 * A signed-out visitor gets the "Sign in to continue" screen, and a member on
 * an admin page gets "This page is for admins. Ask the app owner for access."
 *
 * ```tsx
 * <Route path="/admin" element={<RequireRole role="admin"><AdminPage /></RequireRole>} />
 * ```
 */
export function RequireRole({ role, children }: { role: GenesisRole; children: React.ReactNode }) {
  const auth = React.useContext(AuthContext);
  const current = useGenesisRole();
  if (auth?.isLoading === true) {
    return null;
  }
  if (current == null) {
    return <SignInRequiredScreen />;
  }
  if (role === 'admin' && current !== 'admin') {
    return (
      <p
        data-genesis-require-role="forbidden"
        role="alert"
        style={{ padding: '3rem 1.5rem', textAlign: 'center' }}
      >
        This page is for admins. Ask the app owner for access.
      </p>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// "Sign in to continue" (the visitor side of "Require sign-in to use this app")
// ---------------------------------------------------------------------------

/** Optional hints for `signInToApp` and `signUpToApp`. */
export type GenesisSignInOptions = {
  /** Pre-fills the email field on the hosted page. An invalid email is ignored there. */
  email?: string;
};

/**
 * The authorize params a sign-in or a sign-up adds. `prompt=create` (OIDC)
 * opens the create-account screen, and `login_hint` (OIDC) carries the email.
 * Reads `email` only when it is a string, so `onClick={signUpToApp}` (which
 * passes the click event) still works. The zero-argument overloads of the two
 * helpers keep them assignable to a React click handler.
 */
export function signInHints(
  options: GenesisSignInOptions | undefined,
  create: boolean,
): { prompt?: 'create'; login_hint?: string } {
  const email = typeof options?.email === 'string' ? options.email.trim() : '';
  return {
    ...(create ? { prompt: 'create' as const } : {}),
    ...(email !== '' ? { login_hint: email } : {}),
  };
}

/**
 * Starts the OIDC sign-in from anywhere, inside or outside the `AuthProvider`
 * tree. The screen below renders from `GenesisRoot`, above the app and so
 * above `<GenesisAuth>`, where `useAuth()` is not available.
 *
 * `signInToApp({ email })` pre-fills the email on the hosted sign-in page.
 */
export function signInToApp(): Promise<void>;
export function signInToApp(options: GenesisSignInOptions): Promise<void>;
export function signInToApp(options?: GenesisSignInOptions): Promise<void> {
  return getUserManager().signinRedirect(signInHints(options, false));
}

/**
 * Opens the hosted create-account page directly, for a "Sign up" button.
 * `signUpToApp({ email })` pre-fills the email. On an invite-only app the
 * page shows "This app is invite-only" and creates no account. Like
 * `signInToApp`, it returns the user to the page it was called from.
 */
export function signUpToApp(): Promise<void>;
export function signUpToApp(options: GenesisSignInOptions): Promise<void>;
export function signUpToApp(options?: GenesisSignInOptions): Promise<void> {
  return getUserManager().signinRedirect(signInHints(options, true));
}

/** Who may create an account on this app, as the realm discovery document says. */
export type SignupMode = 'open' | 'invite';

/**
 * Reads `taskade_signup_mode` off the realm discovery document. Unknown
 * (`null`) when the document does not carry it: an older worker, or a
 * backend that could not say. Unknown is never read as open.
 */
export function readSignupMode(metadata: unknown): SignupMode | null {
  if (typeof metadata !== 'object' || metadata == null) {
    return null;
  }
  const mode = (metadata as { taskade_signup_mode?: unknown }).taskade_signup_mode;
  return mode === 'open' || mode === 'invite' ? mode : null;
}

/** The app's sign-up mode from the discovery document, or null when unknown. */
export async function getSignupMode(): Promise<SignupMode | null> {
  try {
    return readSignupMode(await getUserManager().metadataService.getMetadata());
  } catch {
    return null;
  }
}

/**
 * The app's sign-up mode for a render: `undefined` while loading, then the
 * mode or `null` when the document does not say.
 */
export function useSignupMode(): SignupMode | null | undefined {
  const [mode, setMode] = React.useState<SignupMode | null | undefined>(undefined);
  React.useEffect(() => {
    let cancelled = false;
    void getSignupMode().then((next) => {
      if (!cancelled) {
        setMode(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}

/** The one line under the title, by sign-up mode. */
export function signInRequiredHint(mode: SignupMode | null | undefined): string {
  if (mode === 'invite') {
    return 'This app is invite-only. Sign in, or ask the app owner for an account.';
  }
  if (mode === 'open') {
    return 'This app requires an account. Sign in, or create one.';
  }
  return 'This app requires an account. Sign in, or ask the app owner for one.';
}

/**
 * What a visitor sees once the app's owner requires sign-in and a call was
 * refused for want of a signed-in app user. `GenesisRoot` mounts it over the
 * app when the gateway interceptor raises the gate (see `gateway-auth.tsx`),
 * so a generated app needs no code of its own to show it. `RequireRole` above
 * also renders it for a signed-out visitor. Inline styles, like the error
 * fallbacks: it must render even when the app's own styling failed.
 *
 * `GenesisRoot` finds it on `window.__TASKADE_SIGN_IN_SCREEN__` (registered
 * below), not through a named import, so it still builds beside an older copy
 * of this file that predates the screen.
 */
export function SignInRequiredScreen() {
  const mode = useSignupMode();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="genesis-sign-in-title"
      data-genesis-sign-in-required
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(17, 24, 39, 0.6)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '1.75rem',
          borderRadius: 12,
          background: '#ffffff',
          color: '#111827',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
        }}
      >
        <h2 id="genesis-sign-in-title" style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
          Sign in to continue
        </h2>
        <p style={{ color: '#6b7280', margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
          {signInRequiredHint(mode)}
        </p>
        <button
          type="button"
          data-genesis-sign-in
          onClick={() => {
            void signInToApp();
          }}
          style={{
            width: '100%',
            padding: '0.6rem 1rem',
            background: '#1f2937',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.__TASKADE_SIGN_IN_SCREEN__ = SignInRequiredScreen;
}
