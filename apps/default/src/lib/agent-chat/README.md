# Agent Chat SDK (Legacy)

> **DEPRECATED**: Do not use this SDK for new code. Use `@/lib/agent-chat/v2` instead — see `src/lib/agent-chat/v2/README.md` for docs.

---

Simple SDK for building AI Agent Chat interfaces in Taskade Genesis apps.

**Key Features:**

- Manual conversation creation (consumer must create conversation before use)
- Stream opens when conversationId is provided
- Stream stays open throughout (handles reconnection automatically)
- Supports creating/switching conversations

## Quick Start

```typescript
import { useAgentChat, createConversation } from '@/lib/agent-chat';
import { useState } from 'react';

function ChatComponent() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // `error` from the hook surfaces any send failure - render it, never swallow it.
  const { sendMessage, messages, isConnected, error } = useAgentChat(agentId, conversationId);

  // Create the conversation manually. ALWAYS try/catch and show the failure:
  // never let a 404/503 leave the user on a dead, silent button.
  const handleStartChat = async () => {
    try {
      setStartError(null);
      const { conversationId: newId } = await createConversation(agentId);
      setConversationId(newId);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start chat. Try again.');
    }
  };

  // sendMessage THROWS if there is no conversation yet, so gate the Send button on
  // conversationId. The catch is intentional and NOT silent: the hook's `error`
  // state is rendered below, so the failure is always visible to the user.
  const handleSend = async () => {
    try {
      await sendMessage('Hello!');
    } catch {
      /* surfaced via the hook's `error` state, rendered below */
    }
  };

  return (
    <div>
      {!conversationId && <button onClick={handleStartChat}>Start Chat</button>}
      {startError && <p role="alert">{startError}</p>}

      {messages.map(msg => (
        <div key={msg.id}>
          {msg.role === 'user' ? 'You: ' : 'Agent: '}
          {msg.content}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div>Tool calls: {msg.toolCalls.length}</div>
          )}
        </div>
      ))}

      {error && <p role="alert">{error.message}</p>}
      {/* Render Send only once a conversation exists - calling sendMessage before
          then throws "No conversation available" and the click does nothing. */}
      {conversationId && <button onClick={handleSend}>Send</button>}
    </div>
  );
}
```

> **Common failure to avoid (the "dead button"):** rendering `<button onClick={() => sendMessage(text)}>` before a conversation exists, and/or wrapping the call in an empty `catch {}`. The hook throws a descriptive error when there is no conversation and on any network failure - gate the button on `conversationId` and render the hook's `error` (as above) so the user always sees what happened.

## Multiple Conversations

```typescript
const [conversationId, setConversationId] = useState<string | null>(null);
const {
  sendMessage,
  messages,
  createConversation: createNewConversation, // Create new conversation
  switchConversation, // Switch to existing conversation
} = useAgentChat(agentId, conversationId);

// Create new chat
const handleNewChat = async () => {
  const newConvoId = await createNewConversation();
  setConversationId(newConvoId);
};

// Switch to different conversation
const handleSwitchChat = (existingConvoId: string) => {
  switchConversation(existingConvoId);
  setConversationId(existingConvoId);
};
```

## API Reference

**`useAgentChat(agentId, conversationId)`**

- `agentId` - The agent ID (required)
- `conversationId` - The conversation ID (required, pass `null` if not yet created)
- `sendMessage(text)` - Send message to current conversation (requires conversationId)
- `messages` - Array of messages (MessageState[])
- `isConnected` - Stream connection status
- `conversationId` - Current conversation ID (from hook return)
- `createConversation()` - Create new conversation (returns ID)
- `switchConversation(id)` - Switch to different conversation
- `error` - Current error, if any

**Note:** The hook will only connect the stream when `conversationId` is provided (not `null`). You must create a conversation manually before the stream can connect.

**Advanced (low-level):**

- `createConversation(agentId)` - Direct API call. Returns `{ conversationId, nonce }`; the SDK stores the nonce in `localStorage` and replays it as a header on send/stream, so the transcript is bound to this browser. App code only keeps `conversationId`.
- `sendMessage(agentId, conversationId, text)` - Direct API call
- `AgentChatStream` - Stream manager class

See `index.ts` for full type exports.

## Requirements

- Agent must have **public visibility** enabled before creating conversation
- Stream stays open permanently (never close after first response)
- Text deltas are automatically accumulated (append, never replace)
