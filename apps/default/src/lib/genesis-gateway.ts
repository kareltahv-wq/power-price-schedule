/**
 * Low-level fetch helper for the Taskade gateway.
 *
 * A Genesis app reaches every gateway route at a RELATIVE `/api/taskade/*` path - the
 * Director proxy rewrites it to the real gateway endpoint and injects the gateway token
 * server-side, so the app never handles credentials. This helper centralizes the same
 * robust parse + error handling used by `agent-chat/v2/client.ts` so the data + flow
 * helpers stay thin.
 *
 * Auth note: the gateway delegates per-row authorization to the app. If your app exposes
 * data per signed-in user, scope reads/writes yourself (e.g. with a user/owner field).
 */

/**
 * Configuration for the gateway helpers.
 */
export interface ClientOptions {
  /** Base URL for API requests (defaults to relative paths). */
  baseUrl?: string;
}

/**
 * Standard gateway response envelope.
 */
export interface GatewayResponse<TPayload = undefined> {
  ok: boolean;
  payload?: TPayload;
}

/**
 * One key that the gateway refused on a row write (an entry of
 * `extensions.invalidFields` in the 400 body). It never holds the value sent.
 */
export interface GatewayInvalidField {
  /** The key as the app sent it. */
  key: string;
  /** The field path the key resolved to, or null for a key that is not a field. */
  fieldId: string | null;
  /** The column name, when the field has one. */
  title: string | null;
  /** The value shape the field accepts, in plain words. */
  expected: string;
  /** The JSON type the app sent: string, number, boolean, null, array or object. */
  received: string;
}

/**
 * Thrown by `createNode` / `updateNode` when the gateway refuses the write with 400
 * and names the refused keys. Nothing was saved. `message` names the columns for
 * the person at the form ("Please check: Result, Latency (ms)"), so a page can show
 * it as is. `invalidFields` keeps the full list for logs.
 */
export class GatewayInvalidFieldsError extends Error {
  readonly invalidFields: GatewayInvalidField[];

  constructor(invalidFields: GatewayInvalidField[]) {
    const names = new Set(invalidFields.map((field) => field.title || field.key));
    super(`Please check: ${[...names].join(', ')}`);
    this.name = 'GatewayInvalidFieldsError';
    this.invalidFields = invalidFields;
  }
}

function isGatewayInvalidField(entry: unknown): entry is GatewayInvalidField {
  if (entry == null || typeof entry !== 'object') {
    return false;
  }
  const { key, fieldId, title, expected, received } = entry as Record<string, unknown>;
  // `in` plus `== null` accepts null and rejects an omitted key (JSON has no undefined).
  return (
    typeof key === 'string' &&
    key !== '' &&
    'fieldId' in entry &&
    (fieldId == null || typeof fieldId === 'string') &&
    'title' in entry &&
    (title == null || typeof title === 'string') &&
    typeof expected === 'string' &&
    typeof received === 'string'
  );
}

/**
 * The refused keys in a 400 body. Empty when the body names none (another 400, or an
 * older gateway) or when any entry has the wrong shape, so the caller keeps the raw error.
 */
function readInvalidFields(responseText: string): GatewayInvalidField[] {
  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    return [];
  }
  const list = (body as { extensions?: { invalidFields?: unknown } } | null)?.extensions
    ?.invalidFields;
  return Array.isArray(list) && list.every(isGatewayInvalidField) ? list : [];
}

export function isEmptyString(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

// ---------------------------------------------------------------------------
// Pending-request tracking (feeds the app-ready screenshot signal)
// ---------------------------------------------------------------------------

let pendingRequestCount = 0;
let idleWaiters: Array<() => void> = [];

/**
 * True while a tracked gateway request (including its retries) is in flight.
 * genesis-data, genesis-flows, and the agent-chat v2 conversation reads route
 * through `gatewayRequest`; agent-chat conversation creation/streaming and
 * telemetry use raw `fetch` and are deliberately non-blocking for readiness.
 */
export function hasPendingGatewayRequests(): boolean {
  return pendingRequestCount > 0;
}

/**
 * Resolves once no gateway request is in flight (immediately if none is).
 * The app-ready marker in `genesis.tsx` holds the screenshot signal on this
 * until the initial data loads have settled.
 */
export function whenGatewayIdle(): Promise<void> {
  if (pendingRequestCount === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    idleWaiters.push(resolve);
  });
}

function trackRequestSettled(): void {
  pendingRequestCount -= 1;
  if (pendingRequestCount === 0 && idleWaiters.length > 0) {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}

/**
 * Transient upstream statuses worth retrying an idempotent read on. A single one of
 * these (a proxy timeout or a read-limiter burst) otherwise blanks the whole app.
 */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Attempts for an idempotent GET (1 initial + 2 retries). */
const MAX_GET_ATTEMPTS = 3;

/** Base backoff in ms; grows exponentially per attempt, plus jitter. */
const BASE_BACKOFF_MS = 300;

/**
 * Ceiling for a single inter-attempt wait, and the line between a blip and
 * deliberate load-shedding. Short Retry-After hints (the read-limiter's ~1s)
 * are honored and retried; a hint beyond this (the nodes read deadline 503
 * sends 30) means the server asked for room no interactive page load can
 * give, so the request fails fast instead of retrying against it.
 */
const MAX_BACKOFF_MS = 4000;

/**
 * Per-attempt fetch cap. Without it a hung request rides to the CDN's ~125s idle
 * cut once per attempt (3x for a GET). Generous next to the proxy's ~3.5s
 * first-byte expectation (genesisProxyHandler), so it only trips a truly hung upstream.
 */
const ATTEMPT_TIMEOUT_MS = 30000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter: base * 2^(attempt-1), capped, + [0, base). */
function backoffMs(attempt: number): number {
  const expo = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return expo + Math.random() * BASE_BACKOFF_MS;
}

/**
 * Parses a `Retry-After` header; null if absent/unparseable. Handles both standard forms:
 * delay-seconds (`120`) and an HTTP-date (`Mon, 20 Jul 2026 08:10:00 GMT`), the latter
 * resolved to a delay relative to now.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')?.trim();
  if (header == null || header.length === 0) {
    return null;
  }
  if (/^\d+$/.test(header)) {
    return Number.parseInt(header, 10) * 1000;
  }
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

/**
 * Performs a JSON request against `/api/taskade/<path>` and returns the parsed body.
 *
 * Idempotent GETs are retried (with exponential backoff + jitter, honoring `Retry-After`)
 * on transient upstream failures (429/502/503/504) and network rejections, so a single
 * blip does not blank the app. Writes (POST/PATCH/DELETE) are NEVER retried: a transient
 * on a write may have already been applied server-side, so retrying risks double-applying.
 * Content-type / JSON-parse failures are not transient and always throw immediately.
 * Each attempt is capped at `ATTEMPT_TIMEOUT_MS` unless the caller supplies its own
 * `signal` (which then governs alone, and whose `AbortError` propagates unchanged
 * so the usual swallow idiom still works); a timeout/abort is terminal and never
 * retried - a hung upstream is not a blip. A `Retry-After` beyond `MAX_BACKOFF_MS`
 * is treated as load-shedding and fails fast rather than retrying.
 *
 * Every call is counted in the pending-request tracker above (from first
 * attempt to final settle, retries included), which drives the app-ready
 * screenshot signal.
 *
 * @throws GatewayInvalidFieldsError if the gateway refuses a row write and names the keys.
 * @throws Error if the request fails (after retries) or the response is not valid JSON.
 */
export async function gatewayRequest<TResponse>(
  path: string,
  init: RequestInit,
  options?: ClientOptions,
): Promise<TResponse> {
  pendingRequestCount += 1;
  try {
    return await performGatewayRequest<TResponse>(path, init, options);
  } finally {
    trackRequestSettled();
  }
}

async function performGatewayRequest<TResponse>(
  path: string,
  init: RequestInit,
  options?: ClientOptions,
): Promise<TResponse> {
  const response = await performGatewayFetch(path, init, options);
  return parseGatewayJson<TResponse>(response);
}

/**
 * The fetch + retry half of `performGatewayRequest`. Statuses listed in
 * `acceptStatuses` are returned as-is instead of being treated as failures
 * (the conditional GET below accepts 304).
 */
async function performGatewayFetch(
  path: string,
  init: RequestInit,
  options?: ClientOptions,
  acceptStatuses?: ReadonlySet<number>,
): Promise<Response> {
  const baseUrl = options?.baseUrl ?? '';
  const url = `${baseUrl}/api/taskade${path}`;
  const method = (init.method ?? 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? MAX_GET_ATTEMPTS : 1;

  for (let attempt = 1; ; attempt++) {
    const canRetry = attempt < maxAttempts;

    // A FormData body must set its own `multipart/form-data; boundary=...` header,
    // which only the browser can do - so we omit the JSON content type and let it
    // through. This is how a file reaches the gateway's media-upload path (the
    // gateway turns each file part into a real https://files.taskade.com URL).
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeout/abort is terminal, not transient: retrying a hung upstream would
      // just stall the app for another full window. Fail fast so the app's error
      // boundary can show it.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        // Only rewrap when OUR timeout governed the request. A caller-supplied
        // `signal` replaces it (see the fetch call above), so its abort - an
        // unmounting component, a superseded request - must surface unchanged:
        // callers swallow it with the standard `err.name === 'AbortError'`
        // check, and blaming a 30s timeout that never ran would be a lie.
        if (init.signal != null && err.name === 'AbortError') {
          throw err;
        }
        throw new Error(
          `Taskade gateway request timed out: ${method} ${path} gave no response within ${ATTEMPT_TIMEOUT_MS / 1000}s`,
          { cause: err },
        );
      }
      // Network-level rejection (no response). Retryable for idempotent reads only.
      if (canRetry) {
        await delay(backoffMs(attempt));
        continue;
      }
      throw err;
    }

    if (!response.ok && !(acceptStatuses?.has(response.status) ?? false)) {
      if (canRetry && RETRYABLE_STATUSES.has(response.status)) {
        const hinted = retryAfterMs(response);
        // A hint beyond the ceiling is deliberate load-shedding (the nodes
        // read deadline sends Retry-After: 30): retrying in-page would hammer
        // a server that asked for room and burn another full deadline of its
        // CPU on a read that just proved too big. Fall through and throw.
        if (hinted == null || hinted <= MAX_BACKOFF_MS) {
          await delay(hinted ?? backoffMs(attempt));
          continue;
        }
      }
      const responseText = await response.text().catch(() => '');
      // A refused row write names its keys. Throw a message a person can read:
      // pages show `error.message` in a toast as is, and the raw body is JSON.
      const invalidFields = response.status === 400 ? readInvalidFields(responseText) : [];
      if (invalidFields.length > 0) {
        throw new GatewayInvalidFieldsError(invalidFields);
      }
      throw new Error(
        `Taskade gateway request failed: ${response.status} ${responseText || 'Unknown error'}`,
      );
    }

    return response;
  }
}

async function parseGatewayJson<TResponse>(response: Response): Promise<TResponse> {
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text().catch(() => '');

  if (!contentType.includes('application/json')) {
    throw new Error(
      `Invalid response format: expected JSON, got ${contentType}. Response: ${responseText.substring(0, 100)}`,
    );
  }

  try {
    return JSON.parse(responseText) as TResponse;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON response: ${err instanceof Error ? err.message : 'Unknown error'}. Response: ${responseText.substring(0, 200)}`,
      { cause: err },
    );
  }
}

/** Result of a conditional GET: the body only when the server says it changed. */
export type ConditionalGetResult<TResponse> =
  | { changed: false; etag: string | null }
  | { changed: true; etag: string | null; body: TResponse };

const NOT_MODIFIED = new Set([304]);

/**
 * A GET that revalidates with `If-None-Match`. The nodes gateway answers 304
 * from a revision-only lookup when nothing changed, so a live screen can
 * re-check cheaply and often. Same retry/backoff and pending-request tracking
 * as `gatewayRequest`.
 */
export async function gatewayGetIfChanged<TResponse>(
  path: string,
  etag: string | null,
  options?: ClientOptions,
): Promise<ConditionalGetResult<TResponse>> {
  pendingRequestCount += 1;
  try {
    const response = await performGatewayFetch(
      path,
      {
        method: 'GET',
        headers: etag != null ? { 'If-None-Match': etag } : {},
        // The 304 must reach us raw. Left to the HTTP cache the browser is
        // allowed to merge a 304 into the response it already stored and hand
        // `fetch` a 200 with the cached body, which would report every
        // unchanged re-check as a change and re-render the screen. Fetch
        // coerces an author-set conditional request to `no-store` anyway, so
        // stating it costs nothing and makes the guarantee explicit rather
        // than a side effect. It also keeps row-scoped (per-user) rows out of
        // the disk cache.
        cache: 'no-store',
      },
      options,
      NOT_MODIFIED,
    );
    const nextEtag = response.headers.get('etag') ?? etag;
    if (response.status === 304) {
      return { changed: false, etag: nextEtag };
    }
    return { changed: true, etag: nextEtag, body: await parseGatewayJson<TResponse>(response) };
  } finally {
    trackRequestSettled();
  }
}
