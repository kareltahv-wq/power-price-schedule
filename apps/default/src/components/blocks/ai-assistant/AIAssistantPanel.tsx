'use client';

import { isToolUIPart, type ChatStatus, type ToolUIPart, type UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isAwaitingFirstToken } from '@/lib/agent-chat/v2/isAwaitingFirstToken';
import {
  suggestionLabel,
  suggestionPrompt,
  type AgentChatSuggestion,
} from '@/lib/agent-chat/v2/resolveAgentChatDefaults';
import { cn } from '@/lib/utils';

/**
 * Domain-agnostic default starter prompts. These ship whenever the host does NOT
 * pass a `suggestions` prop, so they must fit ANY app vertical (portfolio, CRM,
 * tracker, dashboard) - a vertical-specific default (e.g. billing or job phrasing)
 * leaks the wrong copy onto unrelated apps (golden-path #858). ALWAYS override via the
 * `suggestions` / `placeholder` / `emptyDescription` props with copy grounded in the
 * app's actual domain and data.
 */
export const DEFAULT_ASSISTANT_SUGGESTIONS: readonly string[] = [
  'What can you help me with?',
  'Give me a quick overview',
  'Summarize what I have here',
  'What should I look at first?',
] as const;

export interface AIAssistantPanelProps {
  /** Messages to render. Sourced from the host's `useChat({ chat }).messages`. */
  messages: UIMessage[];
  /** Host wires `chat.sendMessage(...)`. The panel never sends on its own. */
  onSend: (text: string) => void | Promise<void>;
  /** Host passes `status === 'submitted' || status === 'streaming'`. */
  busy?: boolean;
  /** Optional AI SDK chat status, forwarded to the submit button for spinner/stop. */
  status?: ChatStatus;
  /** Optional host stop handler (`useChat({ chat }).stop`). */
  onStop?: () => void;
  /**
   * Optional tool-approval handler. Host wires
   * `useChat({ chat }).addToolApprovalResponse` as
   * `(id, approved) => addToolApprovalResponse({ id, approved })` where `id` is
   * `part.approval.id` (NOT `toolCallId`). When provided, approval-requested
   * tool parts render inline Approve / Deny buttons.
   */
  onApprove?: (id: string, approved: boolean) => void;
  /**
   * Optional visible error line (e.g. derived from `useChat({ chat }).error`).
   * Rendered above the composer with a plain-language message so a failed
   * send/stream never reads as a silently dead chat.
   *
   * Pass the SERVER's message through rather than a generic string of your own.
   * The public agent-chat route maps every failure through `handleErrorMessage`
   * with `audience: 'public-end-user'`, which is what makes the text safe to
   * show a stranger (no internal wording, no URLs, no tool names, none of the
   * owner's billing detail) AND specific about the recovery that actually
   * works - "AI service temporarily unavailable." and "start a new chat"
   * ask for different things from the reader, and a generic line asks for
   * neither.
   */
  errorMessage?: string;
  /**
   * Optional retry handler for the error line. When provided, the error renders
   * with a "Try again" action. Host wires `useChat({ chat }).regenerate` (after
   * `clearError`), which re-runs the failed turn: a trailing user message is
   * resent, a half-written assistant message is dropped and re-requested.
   *
   * Deliberately user-initiated rather than automatic: retrying spends the app
   * OWNER's AI credits, so on a public app page it is the reader's call, not
   * ours.
   */
  onRetry?: () => void;
  /** Starter prompt chips. Defaults to the domain-agnostic starters; pass domain-specific copy. */
  suggestions?: readonly AgentChatSuggestion[];
  /** Header label. */
  title?: string;
  /**
   * Hide the panel's own header row. Set it when a host draws its own header
   * around the panel (FloatingAgentChat does), so the chat shows ONE header.
   * Default `false`: a standalone panel keeps its header.
   */
  hideHeader?: boolean;
  /**
   * Where the empty-state greeting sits in the transcript area. `'start'`
   * (default) keeps it at the top. `'end'` puts it at the bottom, just above
   * the starter chips and the composer, which suits a compact panel.
   */
  emptyStateAlign?: 'start' | 'end';
  /** PromptInput textarea placeholder. */
  placeholder?: string;
  /** Empty-state heading. */
  emptyTitle?: string;
  /** Empty-state body copy. */
  emptyDescription?: string;
  /** Small plain-text line under the composer (legal / disclaimer). */
  footerText?: string;
  /** Dismissable plain-text banner above the conversation. */
  notice?: string;
  /** Machinery strings (tool status, thinking, dismiss). Partial; English fallback per key. */
  labels?: Partial<AIAssistantLabels>;
  className?: string;
}

/** djb2 hash, matching the hosted /a/ page's notice-dismissal key scheme. */
function hashNoticeText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Concatenate the text parts of a UIMessage into a single string. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * True when a message carries a tool or reasoning part. Text-only messages
 * render through the fast `MessageResponse` path; richer messages iterate
 * parts so tool calls (and their approval prompts) and thinking are never
 * silently dropped.
 */
function hasRichPart(message: UIMessage): boolean {
  return message.parts.some((part) => isToolUIPart(part) || part.type === 'reasoning');
}

/**
 * Plain-language status for each tool part state. This panel ships on PUBLIC
 * app pages, so a row must never carry a raw AI SDK state enum NOR the tool's
 * own name: "Bash - Done" is meaningless to the non-technical operators these
 * apps are built for, and an internal tool name has no business on an
 * end-user surface (golden-path #858).
 *
 * `null` renders nothing at all. A finished step is not news to an end user -
 * the answer that follows is - so the row disappears instead of leaving a
 * technical trace behind.
 */
/**
 * Every string the panel renders that is NOT content (title, placeholder,
 * empty state, starters, footer, notice all have their own props). These are
 * the machinery strings - tool status rows, the thinking shimmer, the notice
 * dismiss control - and until they were props, a French app shipped them in
 * English with no way to change it, because blocks are never forked. Pass
 * `labels` from the app's own dictionary; every key is optional and falls
 * back to English.
 */
export interface AIAssistantLabels {
  /** Tool call in flight (input streaming, running, or approval just answered). */
  working: string;
  /** Tool call waiting on the reader's approve / deny. */
  needsApproval: string;
  /** Tool call errored. */
  failed: string;
  /** Tool call denied by the reader. */
  skipped: string;
  /** Shimmer shown while the assistant has produced no text yet. */
  thinking: string;
  /** aria-label of the notice banner's dismiss control. */
  dismissNotice: string;
  /** Approve button on a tool call awaiting approval. */
  approve: string;
  /** Deny button on a tool call awaiting approval. */
  deny: string;
  /** Retry button beside a send / stream error. */
  retry: string;
}

export const DEFAULT_ASSISTANT_LABELS: AIAssistantLabels = {
  working: 'Working on it...',
  needsApproval: 'Needs your approval',
  failed: 'Something went wrong',
  skipped: 'Skipped',
  thinking: 'Thinking...',
  dismissNotice: 'Dismiss notice',
  approve: 'Approve',
  deny: 'Deny',
  retry: 'Try again',
};

function toolStateLabel(state: ToolUIPart['state'], labels: AIAssistantLabels): string | null {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
    case 'approval-responded':
      return labels.working;
    case 'approval-requested':
      return labels.needsApproval;
    case 'output-error':
      return labels.failed;
    case 'output-denied':
      return labels.skipped;
    case 'output-available':
      return null;
  }
}

/**
 * AIAssistantPanel - a thin presentational wrapper over the ai-elements
 * Conversation + Message + PromptInput primitives. It renders the `messages`
 * prop, emits typed text via `onSend`, and reflects `busy`/`status`. It owns NO
 * message state and performs NO network calls - the live `useChat` wiring lives
 * in the host (per the agent-chat/v2 two-component split).
 */
export function AIAssistantPanel({
  messages,
  onSend,
  busy = false,
  status,
  onStop,
  onApprove,
  errorMessage,
  onRetry,
  suggestions = DEFAULT_ASSISTANT_SUGGESTIONS,
  title = 'Assistant',
  hideHeader = false,
  emptyStateAlign = 'start',
  placeholder = 'Ask me anything…',
  emptyTitle = 'How can I help?',
  emptyDescription = 'Ask a question or pick a starter below.',
  footerText,
  notice,
  labels: labelOverrides,
  className,
}: AIAssistantPanelProps) {
  const labels: AIAssistantLabels = { ...DEFAULT_ASSISTANT_LABELS, ...labelOverrides };
  // Dismissal survives the panel unmounting (FloatingAgentChat unmounts it on
  // close) for the tab session, like the hosted /a/ page. Keyed by the notice
  // text so an edited notice shows again; the panel has no agent id to key on.
  const noticeStorageKey = `genesis_agent_notice_${hashNoticeText(notice ?? '')}`;
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(noticeStorageKey) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    // Re-sync when the notice text (and so the key) changes after mount.
    try {
      setNoticeDismissed(sessionStorage.getItem(noticeStorageKey) === '1');
    } catch {
      setNoticeDismissed(false);
    }
  }, [noticeStorageKey]);
  const handleDismissNotice = () => {
    setNoticeDismissed(true);
    try {
      sessionStorage.setItem(noticeStorageKey, '1');
    } catch {
      // sessionStorage unavailable (private mode) - dismissal lasts the render only.
    }
  };
  const isEmpty = messages.length === 0;
  const emptyAtEnd = isEmpty && emptyStateAlign === 'end';
  const effectiveStatus: ChatStatus | undefined = status ?? (busy ? 'submitted' : undefined);

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || busy) {
      return;
    }
    return onSend(text);
  };

  return (
    <Card
      data-genesis-block="ai-assistant-panel"
      // gap-0 py-0: each section sets its own padding, so the shared Card's
      // `gap-6 py-6` only added 24px empty bands between them.
      className={cn(
        'bg-card text-card-foreground flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0',
        className,
      )}
    >
      {hideHeader ? null : (
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Sparkles className="text-muted-foreground size-4" aria-hidden />
          <span className="text-foreground text-sm font-semibold">{title}</span>
        </div>
      )}

      {notice != null && notice.trim() !== '' && !noticeDismissed ? (
        <div
          role="note"
          className="bg-muted text-muted-foreground flex shrink-0 items-start justify-between gap-2 border-b px-4 py-2 text-xs"
        >
          <span className="min-w-0 whitespace-pre-wrap break-words">{notice}</span>
          <button
            type="button"
            aria-label={labels.dismissNotice}
            onClick={handleDismissNotice}
            className="hover:text-foreground shrink-0 px-1 font-semibold"
          >
            ✕
          </button>
        </div>
      ) : null}

      <Conversation>
        {/* 'end': the content fills the scroll area and stacks from the
            bottom, so the greeting sits just above the chips. */}
        <ConversationContent className={emptyAtEnd ? 'min-h-full justify-end' : undefined}>
          {isEmpty ? (
            <ConversationEmptyState
              title={emptyTitle}
              description={emptyDescription}
              icon={<Sparkles className="size-6" aria-hidden />}
              className={emptyAtEnd ? 'size-auto gap-2 px-2 py-0' : undefined}
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {hasRichPart(message) ? (
                    message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        return <MessageResponse key={i}>{part.text}</MessageResponse>;
                      }
                      if (part.type === 'reasoning') {
                        // Collapsible thinking, platform-chat parity. Never
                        // rendered raw: the ai-elements Reasoning owns the
                        // "Thinking..." affordance and auto-collapse.
                        return (
                          <Reasoning
                            key={i}
                            className="w-full"
                            isStreaming={part.state === 'streaming'}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      }
                      if (isToolUIPart(part)) {
                        const statusLabel = toolStateLabel(part.state, labels);
                        if (statusLabel == null) {
                          return null;
                        }
                        return (
                          <div
                            key={i}
                            className="text-muted-foreground my-1 flex flex-wrap items-center gap-2 text-xs"
                          >
                            <span className="italic">{statusLabel}</span>
                            {part.state === 'approval-requested' &&
                            part.approval != null &&
                            onApprove != null ? (
                              // Sized to match the ai-elements ConfirmationAction
                              // buttons (h-8 / sm) so approvals read consistently.
                              <span className="flex gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => onApprove(part.approval.id, true)}
                                >
                                  {labels.approve}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onApprove(part.approval.id, false)}
                                >
                                  {labels.deny}
                                </Button>
                              </span>
                            ) : null}
                          </div>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <MessageResponse>{messageText(message)}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {/* Awaiting the first token: since ai 6.0.255 `'submitted'` holds until
              the first content part streams in, but `text-start` pushes an EMPTY
              text part (flipping to `'streaming'`) before the first delta lands,
              so the row also stays up while the tail assistant message is blank -
              platform-chat parity with `isAwaitingFirstToken`. */}
          {isAwaitingFirstToken(messages, status) ? (
            // `data-genesis-awaiting` mirrors the platform chat's
            // `data-taa-awaiting-first-token`: it mounts on send and unmounts on
            // the first RENDERABLE part, so a QA driver can time
            // time-to-first-token from the DOM alone. Part of the data-genesis selector contract -
            // keep the name stable.
            <Message from="assistant" data-genesis-awaiting="">
              <MessageContent>
                <Shimmer duration={1}>{labels.thinking}</Shimmer>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {errorMessage != null && errorMessage !== '' ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2" role="alert">
          <p className="text-destructive text-xs">{errorMessage}</p>
          {onRetry != null ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={busy}>
              {labels.retry}
            </Button>
          ) : null}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="px-4 pb-2">
          <Suggestions>
            {suggestions.map((suggestion) => (
              <Suggestion
                key={suggestionPrompt(suggestion)}
                suggestion={suggestionLabel(suggestion)}
                // The chip shows the label but sends the prompt (an owner's
                // starter can be "Plan my week" -> a full paragraph).
                onClick={() => void onSend(suggestionPrompt(suggestion))}
                disabled={busy}
              />
            ))}
          </Suggestions>
        </div>
      ) : null}

      <div className="p-4 pt-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder={placeholder} disabled={busy} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={effectiveStatus} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
        {footerText != null && footerText.trim() !== '' ? (
          <p className="text-muted-foreground whitespace-pre-wrap break-words pt-2 text-center text-[11px] leading-snug">
            {footerText}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
