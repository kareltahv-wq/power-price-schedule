import * as React from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * Forwards the signed-in Genesis end-user's OIDC `id_token` to the Taskade data
 * gateway so the backend can enforce per-user row scoping.
 *
 * Why this exists: the headless data gateway (`/api/taskade/.../nodes/*`, which
 * Director proxies to `/web-api/v1/gateways/<token>/...`) can optionally restrict
 * each request to the rows owned by the *verified* end-user (`SpaceApp` row
 * scoping — opt-in, default-OFF). That enforcement only works if the app actually
 * presents the user's identity. Generated app code calls the gateway in many
 * styles (raw `fetch`, the global `axios`, `axios.create()` instances), so instead
 * of a shared client we attach the token at the network-primitive layer: we patch
 * `fetch` and `XMLHttpRequest` once. Any request to the gateway gets
 * `Authorization: Bearer <id_token>`; every other request (third-party APIs,
 * static assets) is left untouched.
 *
 * The secrets proxy (`/_taskade/api/v2/genesis/<spaceId>/proxy`) gets the same
 * token in `x-taskade-app-user` instead. It cannot ride in `Authorization`
 * there: on a published app the Director worker overwrites that header with
 * the gateway token, and on a custom domain the backend reads it AS a gateway
 * token. The backend requires it once the owner turns on "Require sign-in to
 * use this app"; until then the header is ignored.
 *
 * Inert when no user is signed in (the token stays null → no header is added), so
 * apps that don't use row scoping behave exactly as before.
 *
 * The same interceptors also RECOGNIZE the refusal. Once the owner turns on
 * "Require sign-in to use this app", every gateway and proxy call from a
 * visitor without a verified app user answers 401 with one fixed sentence
 * (`SIGN_IN_REQUIRED_MARKER`). Whatever style the app used to make the call,
 * it passed through here, so this is the one place that can turn it into the
 * "Sign in to continue" screen instead of a raw error: the refusal flips a
 * module-level flag that `GenesisRoot` renders the screen from. The response
 * itself is handed back untouched, so the app's own error handling still runs.
 * `GenesisRoot` reads the flag through `window.__TASKADE_SIGN_IN_GATE__`, not a
 * named import, so it still builds beside an older copy of this file.
 */

// The latest verified end-user `id_token`, kept outside React so the patched
// network primitives — which run outside the component tree — can read it.
let currentIdToken: string | null = null;

/** Sync point for the React side — see {@link GatewayAuthSync}. */
export function setGatewayIdToken(token: string | null): void {
  currentIdToken = token;
  if (token != null) {
    // A verified app user arrived (a redirect back, or a silent sign-in that
    // resolved after the first refused load): the app can be shown again.
    setSignInRequired(false);
  }
}

// ---------------------------------------------------------------------------
// "Sign in to continue" gate
// ---------------------------------------------------------------------------

/**
 * The tail of the sentence the backend refuses with, on the gateway routes and
 * the secrets proxy alike. Matched on the body text, not on the status alone:
 * a 401 for a bad gateway token or a missing site-password cookie is not a
 * sign-in request and must not raise the screen.
 */
export const SIGN_IN_REQUIRED_MARKER = 'Sign in to the app to continue';

/** True for the one refusal that means "this app requires an app user". */
export function isSignInRefusal(status: number, bodyText: string): boolean {
  return status === 401 && bodyText.includes(SIGN_IN_REQUIRED_MARKER);
}

let signInRequired = false;
const signInRequiredListeners = new Set<() => void>();

function setSignInRequired(next: boolean): void {
  if (signInRequired === next) {
    return;
  }
  signInRequired = next;
  for (const listener of signInRequiredListeners) {
    listener();
  }
}

/** Whether a first-party call was refused for want of a signed-in app user. */
export function isSignInRequired(): boolean {
  return signInRequired;
}

/** Subscribe to flips of {@link isSignInRequired}; returns the unsubscribe. */
export function subscribeSignInRequired(listener: () => void): () => void {
  signInRequiredListeners.add(listener);
  return () => {
    signInRequiredListeners.delete(listener);
  };
}

/** React view of {@link isSignInRequired}. */
export function useSignInRequired(): boolean {
  return React.useSyncExternalStore(subscribeSignInRequired, isSignInRequired, () => false);
}

/** Raises the gate when a settled first-party response is the sign-in refusal. */
function noteFirstPartyResponse(status: number, bodyText: string): void {
  if (isSignInRefusal(status, bodyText)) {
    setSignInRequired(true);
  }
}

/** Only a 401 pays for the body read; anything else is not looked at. */
function shouldReadFirstPartyBody(status: number): boolean {
  return status === 401 && !signInRequired;
}

/** The header the secrets proxy reads the app user's `id_token` from. */
const APP_USER_TOKEN_HEADER = 'x-taskade-app-user';

const PROXY_PATH_PATTERN = /^\/_taskade\/api\/v2\/genesis\/[^/]+\/proxy$/;

/**
 * Which first-party Taskade surface a request targets, or null for anything
 * else - never a third-party API. The token must never leak off-site, so this
 * guard is load-bearing.
 *  - `gateway`: published same-origin `/api/taskade/*` (Director proxies it to
 *    the gateway), or a dev/preview same-origin `/web-api/v1/gateways/*` path
 *  - `proxy`: the same-origin secrets proxy
 *
 * The same-origin check is essential: matching on pathname alone would attach
 * the token to a cross-origin URL whose path merely starts with a gateway prefix
 * (e.g. `https://evil.example/api/taskade/x` or `//evil.example/...`), leaking it.
 */
function classifyTaskadeRequest(rawUrl: string): 'gateway' | 'proxy' | null {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }
    if (
      url.pathname.startsWith('/api/taskade/') ||
      url.pathname.includes('/web-api/v1/gateways/')
    ) {
      return 'gateway';
    }
    if (PROXY_PATH_PATTERN.test(url.pathname)) {
      return 'proxy';
    }
    return null;
  } catch {
    return null;
  }
}

interface XHRWithGatewayUrl extends XMLHttpRequest {
  __taskadeGatewayUrl?: string;
}

type GatewayAuthWindow = Window & { __taskadeGatewayAuthInstalled__?: boolean };

/**
 * Patches `fetch` + `XMLHttpRequest` once to attach the end-user `id_token` to
 * gateway requests. Idempotent (safe under hot-reload / double-import); a no-op
 * outside the browser.
 */
function installGatewayAuthInterceptors(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as GatewayAuthWindow;
  if (w.__taskadeGatewayAuthInstalled__ === true) {
    return;
  }
  w.__taskadeGatewayAuthInstalled__ = true;
  // Registered here, beside the interceptors, so `GenesisRoot` reads the same
  // flag the interceptors write even if this module is evaluated twice.
  window.__TASKADE_SIGN_IN_GATE__ = { isSignInRequired, subscribeSignInRequired };

  // Guarded per primitive: `genesis.tsx` now imports this module, so it also
  // loads where a test or a harness stubs a bare `window`.
  if (typeof window.fetch === 'function') {
    installFetchInterceptor();
  }
  if (typeof window.XMLHttpRequest === 'function') {
    installXhrInterceptor();
  }
}

function installFetchInterceptor(): void {
  // --- fetch (native fetch calls + libraries using the fetch adapter) ---
  const realFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const target = classifyTaskadeRequest(url);
    if (target == null) {
      return realFetch(input, init);
    }
    const idToken = currentIdToken;
    let nextInit = init;
    if (idToken != null) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (target === 'gateway') {
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${idToken}`);
        }
      } else {
        headers.set(APP_USER_TOKEN_HEADER, idToken);
      }
      nextInit = { ...init, headers };
    }
    return realFetch(input, nextInit).then(async (response) => {
      if (shouldReadFirstPartyBody(response.status)) {
        // Awaited so the gate is up before the caller handles the refusal; a
        // clone, so the caller's own body read is untouched.
        const text = await response
          .clone()
          .text()
          .catch(() => '');
        noteFirstPartyResponse(response.status, text);
      }
      return response;
    });
  };
}

function installXhrInterceptor(): void {
  // --- XMLHttpRequest (the default axios adapter + axios.create() instances) ---
  const realOpen = window.XMLHttpRequest.prototype.open;
  const realSend = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.open = function patchedOpen(
    this: XHRWithGatewayUrl,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.__taskadeGatewayUrl = typeof url === 'string' ? url : url.href;
    return realOpen.call(this, method, url, async ?? true, username, password);
  };
  window.XMLHttpRequest.prototype.send = function patchedSend(
    this: XHRWithGatewayUrl,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url = this.__taskadeGatewayUrl;
    const idToken = currentIdToken;
    const target = url != null ? classifyTaskadeRequest(url) : null;
    if (target != null) {
      this.addEventListener('load', () => {
        if (!shouldReadFirstPartyBody(this.status)) {
          return;
        }
        try {
          noteFirstPartyResponse(this.status, this.responseText);
        } catch {
          // `responseText` throws for a non-text responseType: not a match.
        }
      });
    }
    if (idToken != null && target != null) {
      try {
        if (target === 'gateway') {
          this.setRequestHeader('Authorization', `Bearer ${idToken}`);
        } else {
          this.setRequestHeader(APP_USER_TOKEN_HEADER, idToken);
        }
      } catch {
        // setRequestHeader throws if the request isn't OPENED — ignore and let
        // it proceed unscoped rather than break the call.
      }
    }
    return realSend.call(this, body);
  };
}

// Install as a module side-effect so a bare `import './lib/gateway-auth'` in the
// entry point is enough. Idempotent, so importing it elsewhere is harmless.
installGatewayAuthInterceptors();

/**
 * Bridges the OIDC user's `id_token` into the network interceptors above.
 * Renders nothing. Must live inside the OIDC `<AuthProvider>` — {@link GenesisAuth}
 * mounts it automatically, so app authors don't need to wire it up.
 */
export function GatewayAuthSync(): null {
  const auth = useAuth();
  const idToken = auth.user?.id_token ?? null;
  React.useEffect(() => {
    setGatewayIdToken(idToken);
    return () => setGatewayIdToken(null);
  }, [idToken]);
  return null;
}
