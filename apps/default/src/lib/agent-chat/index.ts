/**
 * Agent Chat SDK for Taskade Genesis (Legacy)
 *
 * @deprecated Use `@/lib/agent-chat/v2` instead for new code.
 *
 * Low-level SDK for building AI Agent Chat interfaces in React applications.
 * Provides API client, SSE stream management, and optional React hooks.
 *
 * @example
 * ```typescript
 * // React hook usage
 * import { useAgentChat, createConversation } from '@/lib/agent-chat';
 * import { useState } from 'react';
 *
 * function ChatComponent() {
 *   const [conversationId, setConversationId] = useState<string | null>(null);
 *   // Render `error`: sendMessage throws on failure, so never swallow it silently.
 *   const { sendMessage, messages, error } = useAgentChat(agentId, conversationId);
 *
 *   // Always try/catch createConversation so a 404/503 cannot dead-fish the UI.
 *   const handleStartChat = async () => {
 *     try {
 *       const { conversationId: newId } = await createConversation(agentId);
 *       setConversationId(newId);
 *     } catch (err) {
 *       // surface the failure to the user (state + a visible alert)
 *     }
 *   };
 *
 *   // Gate Send on conversationId: calling sendMessage earlier throws and looks dead.
 *   return (
 *     <div>
 *       {!conversationId && <button onClick={handleStartChat}>Start Chat</button>}
 *       {messages.map(msg => (
 *         <div key={msg.id}>
 *           {msg.role === 'user' ? 'You: ' : 'Agent: '}
 *           {msg.content}
 *         </div>
 *       ))}
 *       {error && <p role="alert">{error.message}</p>}
 *       {conversationId && <button onClick={() => void sendMessage('Hello!')}>Send</button>}
 *     </div>
 *   );
 * }
 * ```
 */

// Core API client (for advanced usage)
export type { ClientOptions } from './client';
export { createConversation, sendMessage } from './client';

// Stream manager (for advanced usage)
export { AgentChatStream } from './stream';

// Types
export type {
  CreateConversationResponse,
  ErrorEvent,
  ErrorHandler,
  FinishEvent,
  FinishHandler,
  MessageState,
  SendMessageResponse,
  StartEvent,
  StreamEvent,
  StreamEventHandler,
  StreamOptions,
  TextDeltaEvent,
  TextDeltaHandler,
  TextEndEvent,
  TextStartEvent,
  ToolCallEndEvent,
  ToolCallState,
  ToolInputAvailableEvent,
  ToolInputDeltaEvent,
  ToolInputStartEvent,
  ToolOutputAvailableEvent,
} from './types';

// React hook (main API)
export type { UseAgentChatOptions, UseAgentChatReturn } from './hooks';
export { useAgentChat } from './hooks';
