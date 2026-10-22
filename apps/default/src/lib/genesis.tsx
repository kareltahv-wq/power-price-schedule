import type {
  LogFunction,
  LoggerEntryInput,
  SpaceAppLogLifecycleData,
} from '@taskade/parade-shared';
import * as React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { useInRouterContext, useLocation } from 'react-router-dom';

// Side effects only, never a named import (#30531): a template bump replays an
// app's history onto the new template, so an OLD copy of either sibling can sit
// beside this file, and a named import of a symbol it lacks fails the build.
// The sign-in gate reaches this file through `window` instead (see SignInGate).
import './gateway-auth';
import './genesis-auth';
import { hasPendingGatewayRequests, whenGatewayIdle } from './genesis-gateway';

// ---------------------------------------------------------------------------
// Lifecycle logger (injected by Director Preview via window global)
// ---------------------------------------------------------------------------

interface GenesisLogger {
  log: LogFunction;
}
declare global {
  interface Window {
    __TASKADE_APP_LIFECYCLE_LOGGER__?: GenesisLogger;
  }
}

/**
 * Returns the Taskade lifecycle logger if running inside Director Preview.
 * The logger is injected into `window.__TASKADE_APP_LIFECYCLE_LOGGER__` by
 * the preview inject script. Returns `null` in published mode.
 */
export function getGenesisAppLifecycleLogger(): GenesisLogger | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.__TASKADE_APP_LIFECYCLE_LOGGER__ ?? null;
}

// ---------------------------------------------------------------------------
// Error ids
// ---------------------------------------------------------------------------

/** The three client-side failure shapes we report. */
export type GenesisErrorCode = 'error.boundary' | 'error.runtime_error' | 'error.unhandled_promise';

/**
 * One id per thrown error, memoised on the error object.
 *
 * The fallback UI renders BEFORE the boundary's `onError` fires (React calls
 * `componentDidCatch` during commit), so the id can't be minted at report time
 * and handed to the UI — both sides look it up from the error itself instead,
 * and always agree.
 */
const errorIds = new WeakMap<object, string>();

/** Same memoisation for primitive throws, which a WeakMap can't key. */
let lastPrimitiveError: string | null = null;
let lastPrimitiveErrorId: string | null = null;

function randomErrorId(): string {
  const cryptoObj = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stable id for `error` — the value the end-user sees in the fallback UI and
 * the value support can look up in Sentry (`genesis_error_id`).
 */
export function getGenesisErrorId(error: unknown): string {
  if (typeof error === 'object' && error != null) {
    const existing = errorIds.get(error);
    if (existing != null) {
      return existing;
    }
    const id = randomErrorId();
    errorIds.set(error, id);
    return id;
  }
  const key = String(error);
  if (lastPrimitiveError === key && lastPrimitiveErrorId != null) {
    return lastPrimitiveErrorId;
  }
  lastPrimitiveError = key;
  lastPrimitiveErrorId = randomErrorId();
  return lastPrimitiveErrorId;
}

// ---------------------------------------------------------------------------
// Published-mode error telemetry
// ---------------------------------------------------------------------------

/**
 * Runtime-error sink. Relative on purpose: the Director proxy rewrites
 * `/api/taskade/*` to the real gateway endpoint and injects the gateway token
 * server-side, so the app never handles credentials and cannot attribute a
 * crash to an app it doesn't own.
 */
const TELEMETRY_PATH = '/api/taskade/telemetry/errors';

/** Hard cap per page session — a crash loop must not flood the sink. */
const MAX_REPORTS_PER_SESSION = 5;

let reportsSent = 0;
const reportedSignatures = new Set<string>();

/**
 * Fire-and-forget beacon. `keepalive` so a crash immediately followed by a
 * reload still gets reported; every failure is swallowed because telemetry must
 * never be able to break the app it is reporting on.
 */
function sendGenesisErrorReport(payload: Record<string, unknown>) {
  try {
    void fetch(TELEMETRY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      // Default same-origin credentials, exactly like every other app request:
      // a site-wide-password-protected app gates /api/taskade/* on its signed
      // access cookie, so omitting credentials would redirect the beacon to the
      // password page and silently drop telemetry for those apps.
    }).catch(() => {});
  } catch {
    // Ignore.
  }
}

function reportPublishedGenesisError(
  code: GenesisErrorCode,
  errorId: string,
  error: unknown,
  componentStack?: string | null,
) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return;
  }

  // `new Error()` has an empty message, and the sink requires a non-empty one —
  // an unnormalised '' would be rejected while the fallback UI still shows an
  // error id that resolves to nothing. Same fallback string as the inlined
  // catch-all reporter.
  const message = (error instanceof Error ? error.message : String(error)) || 'Unknown error';
  const stack = error instanceof Error ? error.stack : undefined;

  // Dedupe on the failure shape, not the occurrence: a render error re-thrown on
  // every retry is one report, not one per attempt.
  const signature = `${code}|${message}|${stack?.split('\n')[1] ?? ''}`;
  if (reportedSignatures.has(signature) || reportsSent >= MAX_REPORTS_PER_SESSION) {
    return;
  }
  reportedSignatures.add(signature);
  reportsSent += 1;

  sendGenesisErrorReport({
    errorId,
    code,
    message: message.slice(0, 4_000),
    stack: stack?.slice(0, 20_000),
    componentStack: componentStack?.slice(0, 20_000) ?? undefined,
    // Pathname only — a query string is the most likely place for end-user PII.
    path: window.location.pathname.slice(0, 1_000),
    userAgent: window.navigator?.userAgent?.slice(0, 512),
  });
}

/**
 * Report a runtime error.
 *
 * In preview mode this goes to the injected lifecycle logger, which triggers the
 * "Fix with AI" popup. In published mode there is no logger, so it beacons to
 * the Taskade gateway instead (#27626) — before that, published apps emitted no
 * runtime-error telemetry at all and a user-quoted Error ID traced to nothing.
 *
 * @returns the stable error id for this error (also shown in the fallback UI).
 */
export function reportGenesisError(
  code: GenesisErrorCode,
  error: unknown,
  componentStack?: string | null,
): string {
  const errorId = getGenesisErrorId(error);
  const logger = getGenesisAppLifecycleLogger();

  if (logger != null) {
    logger.log({
      level: 'error',
      message: 'Runtime Error',
      data: {
        code,
        message: error instanceof Error ? error.message : String(error),
        stack: [error instanceof Error ? error.stack : undefined, componentStack]
          .filter(Boolean)
          .join('\n'),
      } satisfies SpaceAppLogLifecycleData,
    } satisfies LoggerEntryInput);
    return errorId;
  }

  reportPublishedGenesisError(code, errorId, error, componentStack);
  return errorId;
}

// ---------------------------------------------------------------------------
// Error boundary fallback UI (inline styles for resilience)
// ---------------------------------------------------------------------------

/** Fallback UI shown when the ErrorBoundary catches a render error. */
function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  // Only show the raw error/stack inside Director Preview (where the builder
  // can act on it). In a published app the end-user is David's non-technical
  // customer — they must never see a stack trace, only the friendly copy below.
  // In preview mode the full error is reported to "Fix with AI" via
  // reportGenesisError; in published mode the error is beaconed to the Taskade
  // gateway and only the error id below is surfaced, so a user can quote it to
  // support and have it resolve to a real event.
  const showRawError = getGenesisAppLifecycleLogger() != null;
  const errorId = getGenesisErrorId(error);
  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 600,
        margin: '0 auto',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Something went wrong</h2>
      <p style={{ color: '#999', margin: '0 0 1rem', fontSize: '0.95rem' }}>
        The app encountered an error. You can try again, or refresh the page.
      </p>
      {showRawError && (
        <pre
          style={{
            background: '#f5f5f5',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.8rem',
            color: '#dc2626',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {String(error)}
        </pre>
      )}
      {!showRawError && (
        <p style={{ color: '#999', margin: 0, fontSize: '0.8rem' }}>
          Error ID: <code>{errorId}</code>
        </p>
      )}
      <button
        type="button"
        onClick={resetErrorBoundary}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#1f2937',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section fault isolation (GenesisSection)
// ---------------------------------------------------------------------------

/**
 * Compact fallback shown when a single section (route/feature) throws.
 * Unlike {@link ErrorFallback} this is a card, not a full page - the shell,
 * navigation, auth, and every other section keep working around it.
 */
function SectionErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const showRawError = getGenesisAppLifecycleLogger() != null;
  // A failed React.lazy chunk load is permanently cached by React (it holds
  // onto the rejected loader promise), so resetErrorBoundary would just
  // re-render the same failure. For that case a full reload is the only honest
  // recovery; a render-phase throw, by contrast, retries in place.
  const message = error instanceof Error ? error.message : String(error);
  const isChunkLoadError =
    /loading( css)? chunk|dynamically imported module|failed to fetch dynamically/i.test(message);
  return (
    <div
      role="alert"
      style={{
        padding: '1.5rem',
        margin: '1rem',
        fontFamily: 'system-ui, sans-serif',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        background: '#fafafa',
        maxWidth: 520,
      }}
    >
      <h3 style={{ margin: '0 0 0.375rem', fontSize: '1rem', color: '#111827' }}>
        This section hit an error
      </h3>
      <p style={{ color: '#6b7280', margin: '0 0 1rem', fontSize: '0.875rem' }}>
        The rest of the app still works.{' '}
        {isChunkLoadError
          ? 'Reload the page to recover this section.'
          : 'You can retry just this section.'}
      </p>
      {showRawError && (
        <pre
          style={{
            background: '#f5f5f5',
            padding: '0.75rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.75rem',
            color: '#dc2626',
            margin: '0 0 1rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {String(error)}
        </pre>
      )}
      {!showRawError && (
        <p style={{ color: '#9ca3af', margin: '0 0 1rem', fontSize: '0.75rem' }}>
          Error ID: <code>{getGenesisErrorId(error)}</code>
        </p>
      )}
      <button
        type="button"
        onClick={isChunkLoadError ? () => window.location.reload() : resetErrorBoundary}
        style={{
          padding: '0.4rem 0.9rem',
          background: '#1f2937',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        {isChunkLoadError ? 'Reload page' : 'Retry section'}
      </button>
    </div>
  );
}

/** Minimal, theme-neutral loading state for a lazily-loaded section. */
function SectionLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem',
        color: '#9ca3af',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.875rem',
      }}
    >
      Loading…
    </div>
  );
}

interface GenesisSectionProps {
  children: React.ReactNode;
  name?: string;
  resetKeys?: unknown[];
}

function SectionBoundary({ children, name, resetKeys }: GenesisSectionProps) {
  return (
    <ReactErrorBoundary
      FallbackComponent={SectionErrorFallback}
      resetKeys={resetKeys}
      onError={(error, info) => {
        console.error(`[Genesis] Section error${name ? ` (${name})` : ''}:`, error, info);
        reportGenesisError('error.boundary', error, info.componentStack);
      }}
    >
      <React.Suspense fallback={<SectionLoadingFallback />}>{children}</React.Suspense>
    </ReactErrorBoundary>
  );
}

/**
 * Same boundary, with the current pathname PREPENDED to whatever `resetKeys`
 * the caller passed. Additive on purpose: a caller keying on a route param
 * still gets navigation recovery, so no generated app can accidentally opt out
 * of the #27636 fix by following the older "pass resetKeys" guidance.
 *
 * Split into its own component so `useLocation` is only ever called inside a
 * Router and hooks stay unconditional.
 */
function RoutedSectionBoundary(props: GenesisSectionProps) {
  const { pathname } = useLocation();
  return <SectionBoundary {...props} resetKeys={[pathname, ...(props.resetKeys ?? [])]} />;
}

/**
 * Per-section fault isolation wrapper - wrap each route element (or any
 * independently-failing feature) in one of these so a render-phase throw
 * degrades to a localized card instead of white-screening the whole app.
 *
 * Combines an ErrorBoundary (catch + report + localized retry) with a
 * Suspense boundary (so `React.lazy`-imported sections can load - or fail to
 * load - without blocking the shell).
 *
 * Usage in App.tsx:
 * ```tsx
 * import { lazy } from 'react';
 * import { Routes, Route } from 'react-router-dom';
 * import { GenesisSection } from '@/lib/genesis';
 *
 * const Dashboard = lazy(() => import('@/components/Dashboard'));
 * const Academy = lazy(() => import('@/components/Academy'));
 *
 * <Routes>
 *   <Route path="/" element={<GenesisSection name="Dashboard"><Dashboard /></GenesisSection>} />
 *   <Route path="/academy" element={<GenesisSection name="Academy"><Academy /></GenesisSection>} />
 * </Routes>
 * ```
 *
 * A tripped boundary resets when the route pathname changes, so one failed
 * section cannot pin its error card over every route the user visits
 * afterwards (#27636). Any `resetKeys` you pass are ADDED to that default
 * rather than replacing it, so opting into an extra key (e.g. a route param)
 * can never opt you back out of navigation recovery.
 *
 * Deliberately keyed on `pathname` only, not on the full location: a
 * query-string or hash change, or re-navigating to the path you are already
 * on, does NOT retry a broken section. Keying on `location.key` would retry on
 * every one of those, which turns a permanently-broken section into a retry on
 * each in-section navigation. If a section genuinely switches content on a
 * query param, pass that param yourself: `resetKeys={[searchParams.get('tab')]}`.
 */
export function GenesisSection(props: GenesisSectionProps) {
  // Outside a Router (a section wrapped in a plain single-page app, a test, a
  // Storybook-style harness) there is no pathname to key on, so behavior stays
  // exactly as it was before #27636.
  const inRouter = useInRouterContext();
  return inRouter ? <RoutedSectionBoundary {...props} /> : <SectionBoundary {...props} />;
}

// ---------------------------------------------------------------------------
// App-ready signal (read by the Director Publish screenshot service)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /**
     * `false` from bundle evaluation until real app content has committed,
     * painted, and settled its initial gateway data loads; `true` after. The
     * screenshot capture service waits on this instead of network idle; apps
     * built before the signal existed leave it undefined and get the legacy
     * network-idle capture.
     */
    __TASKADE_APP_READY__?: boolean;
  }
}

if (typeof window !== 'undefined') {
  window.__TASKADE_APP_READY__ = false;
}

/** Resolves after the browser has painted the currently committed frame. */
function nextPaintedFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Flips the app-ready signal once real app content has committed, painted,
 * and the initial gateway data loads have settled.
 *
 * Rendered as the last child inside {@link GenesisRoot}'s error boundary, so
 * its effect runs only when the app tree rendered successfully (if the
 * boundary shows the error fallback instead, the signal stays `false` and
 * the screenshot service retries rather than capturing the error screen),
 * and AFTER the page's own effects in the same flush - so mount-time
 * `getNodes` / flow / chat requests are already counted as pending when the
 * loop below first checks (every template data path funnels through
 * `gatewayRequest`). Each pass waits for the gateway to go idle, gives React
 * a painted frame to commit the fetched data, and re-checks in case that
 * commit scheduled a dependent request. The screenshot service bounds the
 * whole wait, so an app that never settles times out there and is retried,
 * not captured mid-load.
 *
 * What this still cannot see: requests that bypass `gatewayRequest` (a
 * hand-rolled `fetch` in generated code, third-party SDKs) and renders
 * scheduled strictly after the flip. The capture side keeps its own
 * spinner-wait and settle delay as the mitigation for those.
 */
function AppReadyMarker() {
  React.useEffect(() => {
    let cancelled = false;
    const declareReadyWhenSettled = async () => {
      do {
        await whenGatewayIdle();
        await nextPaintedFrame();
        if (cancelled) {
          return;
        }
      } while (hasPendingGatewayRequests());
      window.__TASKADE_APP_READY__ = true;
    };
    void declareReadyWhenSettled();
    // If the error boundary later swaps this subtree for its fallback, drop
    // the signal so a capture in flight does not photograph the error screen.
    return () => {
      cancelled = true;
      window.__TASKADE_APP_READY__ = false;
    };
  }, []);
  return null;
}

// ---------------------------------------------------------------------------
// "Sign in to continue" gate
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** The sign-in gate, registered by `gateway-auth.tsx` (2.5.16+). */
    __TASKADE_SIGN_IN_GATE__?: {
      isSignInRequired: () => boolean;
      subscribeSignInRequired: (listener: () => void) => () => void;
    };
    /** The "Sign in to continue" screen, registered by `genesis-auth.tsx` (2.5.16+). */
    __TASKADE_SIGN_IN_SCREEN__?: React.ComponentType;
  }
}

const subscribeToNothing = () => () => {};
const notRequired = () => false;

/**
 * Shows the "Sign in to continue" screen over the app once a gateway or proxy
 * call was refused for want of a signed-in app user (the owner turned on
 * "Require sign-in to use this app"). The app stays mounted underneath:
 * `<GenesisAuth>` lives inside it, and its silent sign-in or the redirect back
 * clears the gate. Nothing renders until the interceptor raises it, so an app
 * that is not locked, or whose visitor is signed in, is untouched.
 *
 * Both halves are read off `window`, where the sibling modules register them,
 * so an older `gateway-auth.tsx` or `genesis-auth.tsx` that predates the gate
 * simply never shows it, instead of failing the build.
 */
function SignInGate() {
  const gate = typeof window === 'undefined' ? undefined : window.__TASKADE_SIGN_IN_GATE__;
  const required = React.useSyncExternalStore(
    gate?.subscribeSignInRequired ?? subscribeToNothing,
    gate?.isSignInRequired ?? notRequired,
    notRequired,
  );
  const Screen = typeof window === 'undefined' ? undefined : window.__TASKADE_SIGN_IN_SCREEN__;
  return required && Screen != null ? <Screen /> : null;
}

// ---------------------------------------------------------------------------
// GenesisRoot
// ---------------------------------------------------------------------------

/**
 * Genesis root wrapper — must be provided by the base template, not LLM-generated.
 *
 * Wraps children in an ErrorBoundary that:
 * 1. Catches render-phase errors and shows {@link ErrorFallback} instead of a blank page.
 * 2. Reports the error via {@link reportGenesisError} — to Director Preview's
 *    "Fix with AI" popup in preview, to the Taskade telemetry sink once published.
 *
 * Crashes a boundary cannot see (uncaught throws outside render, unhandled
 * rejections, and a bundle that never mounts at all) are owned by the pre-React
 * catch-all script the app-builder inlines into index.html — deliberately not
 * duplicated here.
 */
export function GenesisRoot({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        console.error('[Genesis] Uncaught render error:', error, info);
        reportGenesisError('error.boundary', error, info.componentStack);
      }}
      onReset={() => {
        console.info('[Genesis] User reset error boundary');
      }}
    >
      {children}
      <SignInGate />
      <AppReadyMarker />
    </ReactErrorBoundary>
  );
}
