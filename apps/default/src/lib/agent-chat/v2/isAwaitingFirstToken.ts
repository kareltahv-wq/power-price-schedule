import type { ChatStatus, UIMessage } from 'ai';

/**
 * True when the tail message is an assistant turn that would render as
 * nothing: only `step-start` markers and/or EMPTY text parts. `[].every()` is
 * true, so an empty parts array counts as blank too. A reasoning or tool part
 * ends the window - those bring their own affordance.
 *
 * Mirrors the platform chat's `isTailAssistantBlank`
 * (`src/frontend/ai/utils/isAwaitingFirstToken.ts`) - keep the two in sync.
 */
export function isTailAssistantBlank(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (last == null || last.role !== 'assistant') {
    return false;
  }
  return last.parts.every(
    (part) => part.type === 'step-start' || (part.type === 'text' && part.text.length === 0),
  );
}

/**
 * Whether the transcript should still show its optimistic "Thinking..." row:
 * a send has been made but nothing renderable has come back yet.
 *
 * Since ai 6.0.255 the SDK holds `'submitted'` until the first content part,
 * which covers most of the provider latency on its own. A blank window
 * remains: `text-start` pushes an EMPTY text part (flipping the status to
 * `'streaming'`) before the first delta lands, and the message components
 * render nothing for an empty string - so gating on `'submitted'` alone drops
 * the row into the exact dead gap it exists to cover. Keep it up while the
 * turn is in flight and the tail assistant message is blank, platform-chat
 * parity with `isAwaitingFirstToken` in
 * `src/frontend/ai/utils/isAwaitingFirstToken.ts`.
 */
export function isAwaitingFirstToken(
  messages: UIMessage[],
  status: ChatStatus | undefined,
): boolean {
  if (status === 'submitted') {
    return true;
  }
  return status === 'streaming' && isTailAssistantBlank(messages);
}
