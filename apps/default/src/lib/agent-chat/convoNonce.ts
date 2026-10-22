/**
 * Conversation nonce: the proof that THIS browser created a public conversation.
 *
 * A public agent conversation has no end-user identity, so the gateway binds the
 * transcript to its creator with an opaque nonce returned by
 * `POST .../public-conversations`. This module persists that nonce beside the
 * conversation id (localStorage, with an in-memory fallback when storage is
 * unavailable) and replays it as a request HEADER on every read - transcript,
 * stream, send, chat, list. The SDK does all of this itself: app code keeps
 * storing only `conversationId`, exactly as before.
 *
 * The nonce is a long-lived bearer capability. It travels ONLY in the
 * `X-Taskade-Convo-Nonce` header - never in a URL or query string, which edge
 * access logs record before any application code runs.
 */

export const CONVO_NONCE_HEADER = 'X-Taskade-Convo-Nonce';

/**
 * Sent on create to declare that this client persists and replays the nonce.
 * The gateway only ever asks for a nonce on a conversation created with it.
 */
export const CONVO_NONCE_CAPABLE_HEADER = 'X-Taskade-Convo-Nonce-Capable';

const STORAGE_KEY_PREFIX = 'taskade:agent-chat:convo-nonce:';

/** Same-session fallback (private mode, storage quota, sandboxed iframe). */
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || window.localStorage == null) {
      return null;
    }
    return window.localStorage;
  } catch {
    // Accessing `window.localStorage` itself throws a SecurityError when
    // storage is disabled.
    return null;
  }
}

export function rememberConvoNonce(conversationId: string, nonce: string): void {
  memory.set(conversationId, nonce);
  const store = storage();
  if (store == null) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY_PREFIX + conversationId, nonce);
  } catch {
    // Quota or disabled storage: the in-memory copy still serves this session.
  }
}

export function readConvoNonce(conversationId: string): string | null {
  const cached = memory.get(conversationId);
  if (cached != null) {
    return cached;
  }
  const store = storage();
  if (store == null) {
    return null;
  }
  try {
    const stored = store.getItem(STORAGE_KEY_PREFIX + conversationId);
    if (stored != null && stored !== '') {
      memory.set(conversationId, stored);
      return stored;
    }
  } catch {
    // Treat unreadable storage as no nonce.
  }
  return null;
}

/**
 * Persist the nonce from a create response, if the gateway sent one. An older
 * gateway without the field leaves nothing behind, and reads then carry no
 * nonce header - which is also correct, since such a conversation is never
 * asked for one.
 */
export function rememberConvoNonceFromCreateResponse(
  conversationId: string,
  response: unknown,
): void {
  if (response == null || typeof response !== 'object') {
    return;
  }
  const { nonce } = response as { nonce?: unknown };
  if (typeof nonce === 'string' && nonce !== '') {
    rememberConvoNonce(conversationId, nonce);
  }
}

/** Headers for the create request. */
export function convoNonceCapableHeaders(): Record<string, string> {
  return { [CONVO_NONCE_CAPABLE_HEADER]: '1' };
}

/**
 * Headers for a read of the given conversation(s): every stored nonce,
 * comma-joined (the gateway accepts a list, so `listConversations` can prove
 * a whole batch in one header). Empty when nothing is stored.
 */
export function convoNonceHeaders(conversationIds: readonly string[]): Record<string, string> {
  const nonces: string[] = [];
  const seen = new Set<string>();
  for (const conversationId of conversationIds) {
    const nonce = readConvoNonce(conversationId);
    if (nonce != null && !seen.has(nonce)) {
      seen.add(nonce);
      nonces.push(nonce);
    }
  }
  if (nonces.length === 0) {
    return {};
  }
  return { [CONVO_NONCE_HEADER]: nonces.join(',') };
}

/** Test-only: forget every nonce held in memory. */
export function clearConvoNoncesForTests(): void {
  memory.clear();
}
