# Agent Chat SDK v2

SDK for building AI Agent Chat interfaces in Taskade Genesis apps.
Built on the AI SDK (`@ai-sdk/react`), using the `/chat` endpoint.

## Quick Start

```typescript
import { useChat } from '@ai-sdk/react';
import { createConversation, createAgentChat, resolveChatErrorMessage } from '@/lib/agent-chat/v2';
import { isToolUIPart } from 'ai';
import type { UIMessage } from 'ai';
import { useState } from 'react';
import { ulid } from 'ulidx';

// IMPORTANT: useChat requires a real Chat instance — it crashes if passed undefined.
// Split into two components so useChat is only called after chat is created.

function ChatComponent() {
  const [chat, setChat] = useState<ReturnType<typeof createAgentChat> | null>(null);

  const handleStartChat = async () => {
    const { conversationId } = await createConversation(agentId);
    setChat(createAgentChat(agentId, conversationId));
  };

  if (!chat) return <button onClick={handleStartChat}>Start Chat</button>;
  return <ActiveChat chat={chat} />;
}

function ActiveChat({ chat }: { chat: ReturnType<typeof createAgentChat> }) {
  const { messages, status, error, clearError, regenerate, addToolApprovalResponse } = useChat({
    chat,
    id: chat.id,
  });
  const isSending = status === 'submitted' || status === 'streaming';

  const handleSend = async (text: string) => {
    await chat.sendMessage({
      id: ulid(),
      role: 'user',
      parts: [{ type: 'text', text }],
    });
  };

  return (
    <div>
      {/* ALWAYS render the error state - a failed send/stream with no visible
          error reads as a dead app. Never swallow it in an empty catch.
          Show the SERVER's message via resolveChatErrorMessage: it is already
          safe for a public reader AND names the recovery that actually works
          ("AI service temporarily unavailable." = retry; "start a new chat" =
          retrying will never work). A generic line of your own throws that
          away. Pair it with a retry: clearError() then regenerate() re-runs
          the failed turn. */}
      {error != null && (
        <div role="alert">
          {resolveChatErrorMessage(error)}{' '}
          <button
            type="button"
            onClick={() => {
              clearError();
              void regenerate().catch(() => {});
            }}
          >
            Try again
          </button>
        </div>
      )}
      {messages.map(msg => (
        <div key={msg.id}>
          <strong>{msg.role === 'user' ? 'You' : 'Agent'}:</strong>
          {msg.parts.map((part, i) => {
            // Always render all part types — the agent may use tools even if none
            // are configured yet. Omitting this causes tool calls to be silently dropped.
            if (part.type === 'text') {
              return <span key={i}>{part.text}</span>;
            }
            if (isToolUIPart(part)) {
              // PUBLIC end-user surface: never render part.toolName, part.input,
              // part.output, or the raw state enum. Generic status + approval
              // buttons only (see docs/04_agent_chat.md). A successful step
              // renders nothing - the answer that follows is the news.
              const label =
                part.state === 'approval-requested'
                  ? 'Needs your approval'
                  : part.state === 'output-error'
                    ? 'Something went wrong'
                    : part.state === 'output-denied'
                      ? 'Skipped'
                      : part.state === 'output-available'
                        ? null
                        : 'Working on it...';
              if (label == null) return null;
              return (
                <div key={i}>
                  <em>{label}</em>
                  {part.state === 'approval-requested' && part.approval != null && (
                    <>
                      <button onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}>
                        Approve
                      </button>
                      <button onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}>
                        Deny
                      </button>
                    </>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      ))}
      <button onClick={() => handleSend('Hello!')} disabled={isSending}>Send</button>
    </div>
  );
}
```

## Pre-built AI Elements UI (`@/components/ai-elements/`)

Pre-built, styled React components for chat interfaces are available via AI Elements.
Use these instead of building chat UI from scratch:

| Component      | Import                                  | Purpose                                                                                                                                                          |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Conversation` | `@/components/ai-elements/conversation` | Scrollable chat container with auto-stick-to-bottom                                                                                                              |
| `Message`      | `@/components/ai-elements/message`      | Message bubble with role-based styling + markdown                                                                                                                |
| `PromptInput`  | `@/components/ai-elements/prompt-input` | Chat input form with file attachments + submit                                                                                                                   |
| `Suggestion`   | `@/components/ai-elements/suggestion`   | Quick-reply suggestion pills                                                                                                                                     |
| `Reasoning`    | `@/components/ai-elements/reasoning`    | Collapsible thinking/reasoning display                                                                                                                           |
| `CodeBlock`    | `@/components/ai-elements/code-block`   | Syntax-highlighted code with copy button                                                                                                                         |
| `Tool`         | `@/components/ai-elements/tool`         | Collapsible tool call display - exposes tool names and raw input/output, so do NOT use it on public app pages (see the tool-row rule in `docs/04_agent_chat.md`) |
| `Confirmation` | `@/components/ai-elements/confirmation` | Tool call approval UI with approve/reject slots                                                                                                                  |
| `Shimmer`      | `@/components/ai-elements/shimmer`      | Animated shimmer text — usage: `<Shimmer>Loading...</Shimmer>` (children must be a string)                                                                       |

See `@/components/ai-elements` for the full list of available components that you may use to build your chat UI.

### Full Example with AI Elements

```typescript
import { useChat } from '@ai-sdk/react';
import { createConversation, createAgentChat, resolveChatErrorMessage } from '@/lib/agent-chat/v2';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { ConfirmationAction, ConfirmationActions } from '@/components/ai-elements/confirmation';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { isToolUIPart } from 'ai';
import type { UIMessage } from 'ai';
import { useState } from 'react';
import { ulid } from 'ulidx';

function ChatPage() {
  const [chat, setChat] = useState<ReturnType<typeof createAgentChat> | null>(null);

  const handleStartChat = async () => {
    const { conversationId } = await createConversation(agentId);
    setChat(createAgentChat(agentId, conversationId));
  };

  if (!chat) return <button onClick={handleStartChat}>Start Chat</button>;
  return <ActiveChat chat={chat} />;
}

function ActiveChat({ chat }: { chat: ReturnType<typeof createAgentChat> }) {
  const { messages, status, error, clearError, regenerate, addToolApprovalResponse } = useChat({
    chat,
    id: chat.id,
  });

  const handleSend = async (text: string) => {
    await chat.sendMessage({
      id: ulid(),
      role: 'user',
      parts: [{ type: 'text', text }],
    });
  };

  const hasMessages = messages.length > 0;

  // The outer panel is height-bounded (h-screen here) with flex-col; Conversation
  // is the min-h-0 flex-1 scroll region and PromptInput a plain flex SIBLING -
  // this is what keeps a streaming answer from overlapping the composer.
  return (
    <div className="flex h-screen flex-col">
      <Conversation>
        <ConversationContent>
          {messages.map((msg) => (
            <Message key={msg.id} from={msg.role}>
              <MessageContent>
                <MessageParts message={msg} onApprove={addToolApprovalResponse} />
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {!hasMessages && (
        <Suggestions>
          <Suggestion suggestion="What can you help me with?" onClick={handleSend} />
          <Suggestion suggestion="Tell me about this app" onClick={handleSend} />
        </Suggestions>
      )}

      {/* Visible error state - never omit this or swallow errors silently.
          resolveChatErrorMessage passes the SERVER's message through (already
          end-user-safe, and specific about the recovery); it falls back to a
          generic line only when there is no message at all. Pair it with a
          retry: clearError() then regenerate() re-runs the failed turn. */}
      {error != null && (
        <p className="text-destructive px-4 pb-2 text-xs" role="alert">
          {resolveChatErrorMessage(error)}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              clearError();
              void regenerate().catch(() => {});
            }}
          >
            Try again
          </button>
        </p>
      )}

      <PromptInput onSubmit={({ text }) => handleSend(text)}>
        <PromptInputTextarea />
        <PromptInputFooter>
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

// Always handle all part types — the agent may call tools even if none are configured
// yet. Omitting isToolUIPart handling causes tool calls to be silently dropped.
function MessageParts({
  message,
  onApprove,
}: {
  message: UIMessage;
  onApprove: ReturnType<typeof useChat>['addToolApprovalResponse'];
}) {
  return (
    <>
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;

        if (part.type === 'text') {
          return message.role === 'user' ? (
            <p key={key}>{part.text}</p>
          ) : (
            <MessageResponse key={key}>{part.text}</MessageResponse>
          );
        }

        if (isToolUIPart(part)) {
          // PUBLIC end-user surface: never render part.toolName, part.input,
          // part.output, or the raw state enum ("Bash - Done" is meaningless
          // jargon to end users, and inputs/outputs carry commands, paths, and
          // raw data dumps). Plain status while running, approval buttons when
          // requested, short plain labels for error/denied, and NOTHING once a
          // step finishes successfully - the answer that follows is the news.
          // This mirrors the pre-built AIAssistantPanel block; prefer that
          // block over hand-rolling this.
          const label =
            part.state === 'approval-requested'
              ? 'Needs your approval'
              : part.state === 'output-error'
                ? 'Something went wrong'
                : part.state === 'output-denied'
                  ? 'Skipped'
                  : part.state === 'output-available'
                    ? null
                    : 'Working on it...';
          if (label == null) {
            return null;
          }
          return (
            <div key={key} className="text-muted-foreground my-1 flex flex-wrap items-center gap-2 text-xs">
              <em>{label}</em>
              {part.state === 'approval-requested' && part.approval != null && (
                <ConfirmationActions>
                  <ConfirmationAction
                    variant="outline"
                    onClick={() => onApprove({ id: part.approval.id, approved: false })}
                  >
                    Deny
                  </ConfirmationAction>
                  <ConfirmationAction
                    onClick={() => onApprove({ id: part.approval.id, approved: true })}
                  >
                    Approve
                  </ConfirmationAction>
                </ConfirmationActions>
              )}
            </div>
          );
        }

        return null;
      })}
    </>
  );
}
```

## Tool Call Approval

Both examples above already include full approval handling — it is part of the standard
`MessageParts` pattern and should always be present, even if the agent has no tools
configured today. Tool call parts will simply never appear in that case; the code is inert.

The approval flow is managed by two pieces:

- **`ConfirmationActions` + `ConfirmationAction`** (`@/components/ai-elements/confirmation`) -
  the approve/deny button affordances. No handler logic lives inside them.
- **`addToolApprovalResponse`** (from `useChat`) - call with `{ id: part.approval.id, approved }`.
  The `id` must be the tool part's **`approval.id`**, not `toolCallId`; wrong `id` updates nothing.
  `createAgentChat` then automatically sends the next request to the server.

### Tool state lifecycle (public-surface rendering contract)

| State                                 | What's visible                                                            |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `input-streaming` / `input-available` | "Working on it..." (generic status; never the tool name or input)         |
| `approval-requested`                  | "Needs your approval" + approve/deny buttons                              |
| `approval-responded`                  | "Working on it..." (the run resumes)                                      |
| `output-available`                    | Nothing - the row disappears; the agent's answer that follows is the news |
| `output-error`                        | "Something went wrong"                                                    |
| `output-denied`                       | "Skipped"                                                                 |

Once `addToolApprovalResponse` is called, `createAgentChat` automatically sends the next
request to the server — no manual trigger required.

## API

**`createConversation(agentId, options?)`**
Creates a new public conversation. Returns `{ ok, conversationId, nonce }`. Persist
`conversationId` if the app needs a History / transcript surface later. The
`nonce` is the proof that this browser created the chat: the SDK stores it in
`localStorage` beside the id and replays it as a request header on every read,
so app code never touches it. Never put it in a URL, and never render it.

**`listConversations(agentId, conversationIds, options?)`**
Look up metadata for conversations whose ids this client already stored.
Returns `{ ok, conversations: [{ conversationId, title, createdAt, updatedAt }] }`.
There is no unconstrained list: public conversations have no end-user identity,
so you MUST pass stored ids (max 50). Unknown or foreign ids are omitted.

**`getConversation(agentId, conversationId, options?)`**
Read the public transcript of one conversation. Returns `{ ok, conversationId,
title, createdAt, updatedAt, messages, nextCursor }`. Each message is
`{ id, role: 'user' | 'assistant', text, createdAt }` (tool parts omitted).
The first page is the most recent `limit` messages (1-100, default 50; the
helper rejects a non-integer or out-of-range `limit` before fetch). Pass
`options.cursor` from the previous `nextCursor` to load older turns.

**`createAgentChat(agentId, conversationId, options?)`**
Creates a `Chat` instance configured for the agent. Use with `useChat` from `@ai-sdk/react`.
To continue a stored chat, pass the stored id (do not create a new conversation).

**`useChat({ chat, id })`** (from `@ai-sdk/react`)
Standard AI SDK hook. Returns `{ messages, status, error, clearError, regenerate, addToolApprovalResponse }`.
Wire the retry as `clearError()` then `void regenerate().catch(() => {})` - rejections land back in `error`.

**`addToolApprovalResponse({ id, approved, reason? })`** (from `useChat`)
Submits an approve (`true`) or deny (`false`) decision. **`id` is `toolUIPart.approval.id`**, not `toolCallId`.
The conversation automatically resumes after the response is submitted.

## Reading past conversations

Public conversation history is readable. Persist `conversationId` from
`createConversation` (prefer `createPersistentStore`), then:

```typescript
import { listConversations, getConversation } from '@/lib/agent-chat/v2';

const { conversations } = await listConversations(agentId, storedIds);
const selected = conversations[0];
if (selected == null) {
  // no matching stored chats (unknown ids are omitted)
} else {
  const { messages } = await getConversation(agentId, selected.conversationId);
}
```

A History tab that renders empty and then claims there is no record of the
prompts is a fabricated feature: the empty state usually means the app never
stored the ids. Full pattern (persist helper, empty-state copy, projects vs
this API): `docs/04_agent_chat.md`.

Transcripts are bound to the browser that created them: `listConversations` and
`getConversation` replay the nonce the SDK stored at create time, and a stored
id from another device (or one whose nonce was cleared with site data) is simply
omitted / not found. That is expected - do not treat it as a bug in the API.

## Sending Messages

```typescript
import { ulid } from 'ulidx';

await chat.sendMessage({
  id: ulid(),
  role: 'user',
  parts: [{ type: 'text', text: 'Hello!' }],
});
```

## Message Format

Messages use the AI SDK `UIMessage` type:

```typescript
import { isToolUIPart } from 'ai';

msg.parts.filter((p) => p.type === 'text').map((p) => p.text); // Text
msg.parts.filter(isToolUIPart); // Tool calls
```

## Requirements

- Agent must have **public visibility** enabled before creating a conversation
- `useChat` must receive a real `Chat` instance, never `undefined`

## Agent appearance profile

`getAgentProfile(agentId)` returns what the owner configured once in the agent
settings and the Publish -> Customize tab: `name`, `avatar`, `introduction`
(welcome message), `conversationStarters` (`{ text, prompt }`), `inputPlaceholder`,
`footerText`, `dismissableNotice` and the cosmetic `preferences` (`theme`, `color`,
`headerTitle`, `messageLayout`, `showSuggestions`, `launcherIcon`). The hosted `/a/` page and the website widget render the same
object, so a custom chat UI that defaults to it stays consistent with them.
`resolveAgentChatDefaults(profile, props)` is the merge rule `FloatingAgentChat`
uses: props win, a missing profile yields plain defaults, `showSuggestions: false`
hides the chips.

```typescript
import { getAgentProfile, resolveAgentChatDefaults } from '@/lib/agent-chat/v2';

const profile = await getAgentProfile(agentId).catch(() => null);
const { title, suggestions, placeholder, emptyDescription } = resolveAgentChatDefaults(
  profile,
  {},
);
```
