# 04 - Agent chat

Every Genesis app includes a visible agent interface. Default: drop in the
prebuilt block. Custom UIs: use the SDK v2 pattern. Full SDK reference:
`src/lib/agent-chat/v2/README.md`.

## Default: FloatingAgentChat

```tsx
import { FloatingAgentChat } from '@/components/blocks';

<FloatingAgentChat agentId={AGENT_ID} publicAgentId={PUBLIC_AGENT_ID} />;
```

Handles the launcher, mobile-responsive panel, SDK wiring, error/retry state,
and a hosted-iframe fallback. Renders nothing when both ids are absent.

Appearance comes from the agent, not from props: the block reads the agent's
public profile (`getAgentProfile`) and defaults the header title (custom header
or agent name), the starter chips (the agent's conversation starters, hidden if
the owner turned suggestions off), the composer placeholder, the empty-state
welcome message, the launcher accent color and the launcher emoji - the same
values the hosted `/a/` page and the website widget show. Do NOT re-type them.
Pass `title`, `suggestions`, `placeholder`, `emptyDescription` or `accentColor`
only when the app genuinely needs to differ; every prop wins over the profile.

Render the block once in the app shell, beneath `<BrowserRouter>`. Hide it
on checkout and pricing routes with one condition on the route:

```tsx
function AppChat() {
  const { pathname } = useLocation();
  return (
    <div hidden={/^\/(checkout|pricing)(\/|$)/.test(pathname)}>
      <FloatingAgentChat agentId={AGENT_ID} publicAgentId={PUBLIC_AGENT_ID} />
    </div>
  );
}
```

Hide the block, never leave it out of the JSX. An unmount drops an open
conversation, so the visitor comes back from checkout to a closed, empty chat.
The `(\/|$)` ends the match at the segment: `/checkout` and `/checkout/pay`
hide the chat, and `/checkout-faq` and `/pricingfaq` keep it.

Set `position="bottom-left"` when the app's own call to action sits in the
bottom-right corner. The open panel already has one header (the agent's avatar,
the title and a close button), so do not wrap the block in a header or card.

## The two ids (do not swap them)

| Prop            | What it is                                                                           | Drives                     |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `agentId`       | SpaceAgent id from the `manage_agent` CreateAgent result ("The new agent id is ...") | the in-app SDK             |
| `publicAgentId` | trailing segment of the public `/a/{publicAgentId}` URL                              | the hosted iframe fallback |

Passing the `/a/...` id as `agentId` 404s against the SDK. The agent must have
PUBLIC visibility or conversation creation fails ("Public agent not found").

## Custom UI: SDK v2 two-component split

`useChat` crashes if passed `undefined` - create the chat first, render the
hook user only after:

```tsx
import { useChat } from '@ai-sdk/react';
import { createConversation, createAgentChat } from '@/lib/agent-chat/v2';
import { ulid } from 'ulidx';

function ChatLauncher() {
  const [chat, setChat] = useState<ReturnType<typeof createAgentChat> | null>(null);
  const start = async () => {
    const { conversationId } = await createConversation(AGENT_ID);
    setChat(createAgentChat(AGENT_ID, conversationId));
  };
  if (!chat) return <Button onClick={start}>Start chat</Button>;
  return <ActiveChat chat={chat} />;
}

function ActiveChat({ chat }: { chat: ReturnType<typeof createAgentChat> }) {
  const { messages, status, stop, error, addToolApprovalResponse } = useChat({ chat, id: chat.id });
  const send = (text: string) =>
    chat.sendMessage({ id: ulid(), role: 'user', parts: [{ type: 'text', text }] });
  // Pass `error` through so a failed send/stream is visible - never swallow it.
  return (
    <AIAssistantPanel
      messages={messages}
      onSend={send}
      status={status}
      onStop={stop}
      errorMessage={error != null ? 'Something went wrong - please try again.' : undefined}
      onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
    />
  );
}
```

Pair with `<AIAssistantPanel />` from `@/components/blocks` (pass `messages`,
`onSend`, `busy`, `status`, `onStop`, `onApprove`, and `errorMessage` derived
from `useChat`'s `error` so failures are visible) or compose
`@/components/ai-elements/*` directly.

## Reading past conversations (history / transcript / memory)

Public conversation history is readable. Use the SDK helpers, never a
hand-rolled `fetch` and never a UI shell with nothing behind it.

If `listConversations` / `getConversation` are not exported from
`@/lib/agent-chat/v2`, this scaffold cannot read history. Do not invent an
endpoint, and do not ship an empty History tab. Tell the user the app needs a
scaffold that includes those helpers, then stop.

**Persist ids yourself.** `createConversation` returns `{ conversationId, nonce }`.
Store the id (prefer `createPersistentStore` from `@/lib/createPersistentStore`,
or `localStorage`) on every successful create. Ignore `nonce`: the SDK already
keeps it in `localStorage` beside the id and replays it as a header on every
read, which is what binds a transcript to the browser that created it. A stored
id from another device reads as not found, and that is correct. The default
`<FloatingAgentChat />` does not persist ids, so a history surface must own
`createConversation` (custom UI) rather than wrapping the floating block and
hoping. Public conversations have no end-user identity, so the API cannot list
every chat for an agent: an unconstrained list would expose one visitor's
transcript to another.
`listConversations(agentId, storedIds)` looks up metadata for ids you already
hold (unknown or foreign ids are omitted). `getConversation(agentId, id)`
returns user/assistant text only (tool names and payloads are omitted), newest
page first; pass `cursor` from `nextCursor` to load older turns.

```tsx
import { useEffect, useState } from 'react';
import {
  PUBLIC_CONVERSATION_LIST_MAX_IDS,
  createConversation,
  createAgentChat,
  listConversations,
  getConversation,
} from '@/lib/agent-chat/v2';
import { createPersistentStore } from '@/lib/createPersistentStore';

const useChatIds = createPersistentStore<{
  ids: string[];
  remember: (id: string) => void;
}>('my-app:agent-chat-ids', (set) => ({
  ids: [],
  remember: (id) => set((state) => (state.ids.includes(id) ? state : { ids: [...state.ids, id] })),
}));

function ChatLauncher() {
  const [chat, setChat] = useState<ReturnType<typeof createAgentChat> | null>(null);
  const startChat = async () => {
    const { conversationId } = await createConversation(AGENT_ID);
    useChatIds.getState().remember(conversationId);
    setChat(createAgentChat(AGENT_ID, conversationId));
  };
  if (chat == null) {
    return <button onClick={() => void startChat()}>Start chat</button>;
  }
  return <ActiveChat chat={chat} />;
}

function HistoryPage() {
  const ids = useChatIds((state) => state.ids);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof listConversations>>['conversations']
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void listConversations(AGENT_ID, ids.slice(-PUBLIC_CONVERSATION_LIST_MAX_IDS))
      .then((result) => {
        if (!cancelled) setItems(result.conversations);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load past chats. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (error != null) return <p role="alert">{error}</p>;
  if (ids.length === 0) return <p>No past chats on this device yet.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.conversationId}>{item.title ?? 'Untitled chat'}</li>
      ))}
    </ul>
  );
}

function Transcript(props: { conversationId: string }) {
  const { conversationId } = props;
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof getConversation>>['messages']>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void getConversation(AGENT_ID, conversationId).then((result) => {
      if (!cancelled) setMessages(result.messages);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <>
      {messages.map((msg) => (
        <p key={msg.id}>
          {msg.role === 'user' ? 'You' : 'Assistant'}: {msg.text}
        </p>
      ))}
    </>
  );
}
```

To send another turn in a stored chat, pass that same `conversationId` to
`createAgentChat` (do not call `createConversation` again). The live panel
starts empty: `createAgentChat` does not take prior transcript messages.
Render past turns from `getConversation` (text rows), then let the user
continue on a Chat instance bound to the stored id.

**Projects vs this API.** Use `listConversations` / `getConversation` for a
visitor's own past chats in the app UI. Write turns into a project only when
you need workspace-visible, owner-queryable, or agent-groundable memory
(projects are the database; a local id list is per-browser and invisible to
the agent and to Workspace DNA). Do not do both for a simple history tab, and
do not tell the user you have no record of their prompts if you skipped
persisting ids.

## Rules that prevent the classic bugs

- Never ship a History / transcript / past-chats surface without
  `listConversations` + `getConversation` and a persisted id list. An empty
  tab with copy like "no record of your prompts" is a fabricated feature: the
  data is readable, and the empty state usually means the app never stored
  `conversationId`. If those helpers are not in this scaffold, do not invent a
  fetch and do not ship the tab.
- Keep chat textareas user-resizable: the scaffold's `PromptInput` textarea
  ships with `resize-y` on purpose - do not strip it or lock the composer to a
  fixed height in custom chat UIs. Operators paste long briefs; a locked
  16px-tall composer is a recurring complaint.
- Never bind Send before the conversation exists (the "dead button"). A send
  handler wired while the `Chat` instance / `conversationId` is still null does
  nothing with zero feedback. Disable Send (and suggestion chips) until
  `createConversation` has resolved; never call a send with a null id.
- Never swallow send errors. An empty `catch {}` anywhere in the chat path is a
  bug - the user clicks Send and nothing happens. Every catch must set visible
  UI state (inline error line + retry); render `useChat`'s `error` too.
  `console.error` alone is not handling.
- Layout: inside a height-bounded `flex h-full flex-col` panel, the messages
  list must be `min-h-0 flex-1 overflow-y-auto` and the composer a plain flex
  SIBLING below it. A `flex-1` messages box missing `min-h-0`/`overflow-y-auto`
  inside an `overflow-hidden` panel grows past the panel while streaming and
  pushes the composer under the clipped edge - the streamed answer renders on
  top of where the input should be. `AIAssistantPanel`/`Conversation` already
  do this correctly.
- Render ALL message part types. Filter text parts AND handle
  `isToolUIPart(part)` - otherwise tool calls are silently dropped.
- Never print a tool's name, `part.input`, or `part.output` on a tool row. This
  is a public, end-user surface: `getToolName(part)` yields internal
  identifiers ("bash", "file_manager") that read as alarming jargon, and the
  input/output carry commands, paths, and raw data dumps. Show a plain status
  only ("Working on it...") while a step runs, and render nothing once it
  finishes successfully; the exceptional terminal states keep a short
  plain-language row ("Something went wrong" for `output-error`, "Skipped" for
  `output-denied`) - `AIAssistantPanel` already does exactly this.
- Tool approval: call `addToolApprovalResponse({ id, approved })` with
  `part.approval.id`, NOT `toolCallId`. The wrong id updates nothing. The
  conversation auto-resumes after the response.
- Message ids: generate with `ulid()`.
- Busy state: `status === 'submitted' || status === 'streaming'`.
- Auto-scroll ONLY when the user is already at the bottom. Never
  `useEffect(() => bottomRef.current?.scrollIntoView(), [messages])` unguarded -
  it yanks the reader back down on every streamed token, and `behavior: 'smooth'`
  turns that yank into a per-token animation the user sees as the box "shaking".
  Strongly prefer `AIAssistantPanel` / `Conversation` (they ride
  `use-stick-to-bottom`, which sticks only while at the bottom and lets go the
  instant you scroll up). If you must hand-roll, capture "was at the bottom"
  from the user's OWN scrolling BEFORE the content grows - do NOT sample the
  distance after render, or one big chunk (>120px in a single update) reads as
  "scrolled up" and drops stick-to-bottom. And do NOT use smooth:

  ```tsx
  const atBottom = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    if (atBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);
  // <div ref={scrollRef} onScroll={onScroll}> …messages… <div ref={bottomRef} /> </div>
  ```

- Custom panels must be responsive: full-bleed on phones, fixed corner panel
  from `sm:` up (never a bare `w-[400px] h-[600px]`).
