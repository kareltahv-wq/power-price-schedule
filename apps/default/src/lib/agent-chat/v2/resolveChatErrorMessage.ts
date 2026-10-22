/**
 * Turn a `useChat({ chat }).error` into the line to show the reader.
 *
 * Show the SERVER's message. Do not write your own.
 *
 * The public agent-chat route maps every failure through `handleErrorMessage`
 * with `audience: 'public-end-user'` before it reaches the browser, and the AI
 * SDK hands that exact string back as `error.message`. Two things follow:
 *
 * 1. It is already safe for a stranger. Internal wording, URLs, tool names and
 *    the app owner's billing detail are stripped server-side, so there is
 *    nothing left to hide behind a generic line.
 * 2. It is the only ACTIONABLE half. "AI service temporarily unavailable."
 *    means wait and retry; "This chat has too much content to save. Please
 *    start a new chat" means retrying will fail again forever. One generic
 *    string collapses those into the same shrug and sends half the readers
 *    down the wrong path.
 *
 * One wrinkle: a failure BEFORE the stream opens (credits exhausted, 401 from
 * the app's auth gate, 429) reaches the SDK as a non-OK response, and the SDK
 * throws `new Error(await response.text())` - so `error.message` is the JSON
 * error envelope `{"ok":false,"message":"...","code":...}` as a string. The
 * server's message is still the `message` field; unwrap it rather than show
 * the reader a blob of JSON.
 *
 * The fallback exists only for an error with no message at all (a bare
 * `new Error('')`, a rejected fetch with empty text) - never as a way to
 * override text the server chose.
 */
export const CHAT_ERROR_FALLBACK_MESSAGE = 'Something went wrong - please try again.';

export function resolveChatErrorMessage(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  if (message == null || message.trim() === '') {
    return CHAT_ERROR_FALLBACK_MESSAGE;
  }
  return unwrapErrorEnvelope(message);
}

function unwrapErrorEnvelope(message: string): string {
  const trimmed = message.trim();
  if (!trimmed.startsWith('{')) {
    return message;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed != null && 'message' in parsed) {
      const inner = (parsed as { message?: unknown }).message;
      if (typeof inner === 'string' && inner.trim() !== '') {
        return inner;
      }
    }
  } catch {
    // Not an envelope; the text itself is the message.
  }
  return message;
}
