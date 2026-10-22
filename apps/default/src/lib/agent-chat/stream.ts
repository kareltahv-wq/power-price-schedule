import { convoNonceHeaders } from './convoNonce';
import type {
  ErrorEvent,
  FinishEvent,
  MessageState,
  StreamEvent,
  StreamEventHandler,
  StreamOptions,
  TextDeltaEvent,
} from './types';
import { StreamEventSchema } from './types';

/**
 * Event emitter interface for stream events
 */
type EventMap = {
  event: StreamEventHandler;
  'text-delta': (event: TextDeltaEvent) => void;
  finish: (event: FinishEvent) => void;
  error: (event: ErrorEvent) => void;
  open: () => void;
  close: () => void;
};

/** SSE dispatches a frame on a blank line (CRLF CRLF, LF LF, or CR CR). */
const SSE_FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/;

/** Line terminators inside one SSE frame. */
const SSE_LINE_SEPARATOR = /\r\n|\n|\r/;

/**
 * 4xx client errors a retry cannot fix (401/403 above all: on a row-scoped app
 * an absent or expired app token would otherwise retry forever). 408 (request
 * timeout) and 429 (rate limited) are transient and stay retryable, as do 5xx
 * and network failures.
 */
function isNonRetryableStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** HTTP-status stream failure; carries the status so reconnect can classify it. */
class StreamRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Stream request failed with status ${status}`);
    this.name = 'StreamRequestError';
    this.status = status;
  }
}

/**
 * Manages SSE connection for agent conversation streaming
 *
 * Handles connection lifecycle, event parsing, and message state accumulation.
 * The stream stays open permanently and handles all messages in the conversation.
 *
 * **Transport**: this uses `fetch` + a `ReadableStream` reader rather than the
 * native `EventSource`. `EventSource` cannot carry an `Authorization` header, so
 * on a row-scoping-enabled app (where the gateway requires a verified end-user)
 * every native-`EventSource` connection would 401 forever. `lib/gateway-auth`
 * patches `fetch`, so going through `fetch` attaches the end-user bearer token
 * automatically. Emitted events and the public API are unchanged.
 *
 * **Memory Management**: The `messageStates` Map accumulates messages throughout the conversation.
 * For long-running conversations, call `clearMessages()` when switching conversations
 * or create a new stream instance for new conversations.
 *
 * @example
 * ```typescript
 * const stream = new AgentChatStream('agent-456', 'convo-789');
 * stream.on('text-delta', ({ id, delta }) => {
 *   // Append delta to message content
 * });
 * stream.connect();
 * ```
 */
export class AgentChatStream {
  private agentId: string;
  private conversationId: string;
  private options: Required<StreamOptions>;
  private abortController: AbortController | null = null;
  private listeners: Map<keyof EventMap, Set<EventMap[keyof EventMap]>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageStates: Map<string, MessageState> = new Map();
  private currentMessageId: string | null = null;
  private isConnecting = false;
  private isOpen = false;
  private buffer = '';

  constructor(agentId: string, conversationId: string, options?: StreamOptions) {
    this.agentId = agentId;
    this.conversationId = conversationId;
    this.options = {
      baseUrl: options?.baseUrl ?? '',
      autoReconnect: options?.autoReconnect ?? true,
      reconnectDelay: options?.reconnectDelay ?? 1000,
      onError:
        options?.onError ??
        ((error: Error) => {
          // Log errors by default to help with debugging
          // In production, consumers should provide their own error handler
          console.error('[AgentChatStream] Unhandled error:', error);
        }),
    };
  }

  /**
   * Clear all accumulated message states
   * Useful when switching conversations or resetting the stream state
   */
  clearMessages(): void {
    this.messageStates.clear();
    this.currentMessageId = null;
  }

  /**
   * Update the conversation ID for this stream
   * Useful when switching to a new conversation while keeping stream open
   * Automatically clears message states when switching conversations
   */
  setConversationId(conversationId: string): void {
    if (this.conversationId === conversationId) {
      return;
    }
    // Track both connected and connecting states to handle race conditions
    const wasConnected = this.isConnected;
    const wasConnecting = this.isConnecting;
    this.disconnect();
    this.conversationId = conversationId;
    // Clear message state when switching conversations
    this.clearMessages();
    // Reconnect if we were connected or in the process of connecting
    if (wasConnected || wasConnecting) {
      this.connect();
    }
  }

  /**
   * Opens SSE connection to stream endpoint
   * Stream stays open permanently - never close after first response
   */
  connect(): void {
    // Check isConnecting first since it's set synchronously before any async work
    // This prevents race conditions where connect() is called multiple times
    // before the reader is running
    if (this.isConnecting) {
      return; // Already connecting
    }

    if (this.isOpen) {
      return; // Already connected
    }

    this.disconnect(); // Clean up any existing connection

    const baseUrl = this.options.baseUrl;
    const url = `${baseUrl}/api/taskade/agents/${encodeURIComponent(
      this.agentId,
    )}/public-conversations/${encodeURIComponent(this.conversationId)}/stream`;

    // Validate required parameters
    if (!this.agentId || !this.conversationId) {
      const error = new Error(
        `Missing required parameters: agentId=${this.agentId || 'null'}, conversationId=${
          this.conversationId || 'null'
        }`,
      );
      this.options.onError(error);
      this.emit('error', {
        type: 'error',
        errorText: error.message,
      });
      return;
    }

    this.isConnecting = true;
    this.buffer = '';
    const controller = new AbortController();
    this.abortController = controller;
    void this.readStream(url, controller);
  }

  /**
   * Closes SSE connection
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.buffer = '';
    this.isConnecting = false;
    this.isOpen = false;
  }

  /**
   * Opens the SSE response with `fetch` and pumps its body until it ends.
   * Runs detached from `connect()`; `controller` identifies this attempt so a
   * superseded reader cannot clobber the state of a newer one.
   */
  private async readStream(url: string, controller: AbortController): Promise<void> {
    try {
      // The conversation nonce rides in a header here too - one more reason
      // this is `fetch` and not a native `EventSource`, which could only carry
      // it in the URL.
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream', ...convoNonceHeaders([this.conversationId]) },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new StreamRequestError(response.status);
      }

      const body = response.body;
      if (body == null) {
        throw new Error('Stream response has no readable body');
      }

      if (this.abortController !== controller) {
        return; // superseded while the request was in flight
      }

      this.isConnecting = false;
      this.isOpen = true;
      this.emit('open');

      const reader = body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        this.buffer += decoder.decode(value, { stream: true });
        this.drainFrames();
      }

      this.handleStreamEnd(controller, null);
    } catch (error) {
      this.handleStreamEnd(controller, error);
    }
  }

  /**
   * Splits the buffered bytes into SSE frames and dispatches the complete ones.
   */
  private drainFrames(): void {
    for (;;) {
      const match = SSE_FRAME_SEPARATOR.exec(this.buffer);
      if (match == null) {
        return;
      }
      const frame = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      this.handleFrame(frame);
    }
  }

  /**
   * Parses one SSE frame and dispatches its `data:` payload.
   * Comment lines (the server's `: connected` keepalive) and other fields are
   * ignored, matching what `EventSource.onmessage` used to deliver.
   */
  private handleFrame(frame: string): void {
    const dataLines: string[] = [];
    for (const line of frame.split(SSE_LINE_SEPARATOR)) {
      if (line === '' || line.startsWith(':')) {
        continue;
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      if (field !== 'data') {
        continue;
      }
      const raw = colon === -1 ? '' : line.slice(colon + 1);
      dataLines.push(raw.startsWith(' ') ? raw.slice(1) : raw);
    }

    if (dataLines.length === 0) {
      return;
    }

    try {
      const data = JSON.parse(dataLines.join('\n'));
      const event = StreamEventSchema.parse(data);
      this.handleEvent(event);
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error('Failed to parse event');
      this.options.onError(parseError);
      this.emit('error', {
        type: 'error',
        errorText: `Parse error: ${parseError.message}`,
      });
    }
  }

  /**
   * Tears down a finished/failed attempt and reconnects if it was not a
   * deliberate `disconnect()`.
   */
  private handleStreamEnd(controller: AbortController, error: unknown): void {
    if (this.abortController !== controller) {
      return; // superseded by a newer connection - leave its state alone
    }

    this.abortController = null;
    this.isConnecting = false;
    this.isOpen = false;
    this.buffer = '';

    if (controller.signal.aborted) {
      return; // disconnect() already emitted nothing by design
    }

    if (error != null) {
      const streamError = error instanceof Error ? error : new Error('Stream connection error');
      this.options.onError(streamError);
      this.emit('error', {
        type: 'error',
        errorText: `Stream connection error: ${streamError.message}`,
      });
    }

    this.emit('close');

    // Auto-reconnect if enabled - but never on a non-retryable client error
    // (401/403 etc.): retrying cannot succeed until the caller reconnects with
    // fresh credentials, and looping would hammer the gateway once per second.
    // The terminal failure was already surfaced above via onError + 'error'.
    const isTerminal = error instanceof StreamRequestError && isNonRetryableStatus(error.status);
    if (this.options.autoReconnect && !isTerminal) {
      this.scheduleReconnect();
    }
  }

  /**
   * Subscribe to stream events
   *
   * @param event - Event type to listen for
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  on<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * Unsubscribe from stream events
   */
  off<K extends keyof EventMap>(event: K, handler: EventMap[K]): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Get current connection state
   */
  get isConnected(): boolean {
    return this.isOpen;
  }

  /**
   * Get accumulated message states
   */
  get messages(): Map<string, MessageState> {
    return new Map(this.messageStates);
  }

  /**
   * Get message state by ID
   */
  getMessage(id: string): MessageState | undefined {
    return this.messageStates.get(id);
  }

  /**
   * Handle incoming SSE event
   */
  private handleEvent(event: StreamEvent): void {
    // Emit generic event
    this.emit('event', event);

    switch (event.type) {
      case 'start':
        this.currentMessageId = event.messageId;
        // Always create/update message on start to ensure it exists
        if (!this.messageStates.has(event.messageId)) {
          this.messageStates.set(event.messageId, {
            id: event.messageId,
            content: '',
            isComplete: false,
            role: 'assistant',
          });
        }
        break;

      case 'text-start':
        // event.id is a text segment ID, but text belongs to the current message (from 'start' event)
        // Ensure the current message exists
        if (this.currentMessageId) {
          if (!this.messageStates.has(this.currentMessageId)) {
            this.messageStates.set(this.currentMessageId, {
              id: this.currentMessageId,
              content: '',
              isComplete: false,
              role: 'assistant',
            });
          }
        }
        break;

      case 'text-delta': {
        // event.id is a text segment ID, but text belongs to the current message (from 'start' event)
        // Append delta to the current message's content
        if (this.currentMessageId) {
          const existingState = this.messageStates.get(this.currentMessageId);
          if (existingState) {
            // Create new object with updated content to ensure change detection
            const updatedState: MessageState = {
              ...existingState,
              content: existingState.content + event.delta,
            };
            this.messageStates.set(this.currentMessageId, updatedState);
          } else {
            // Create message if it doesn't exist (shouldn't happen, but handle gracefully)
            this.messageStates.set(this.currentMessageId, {
              id: this.currentMessageId,
              content: event.delta,
              isComplete: false,
              role: 'assistant',
            });
          }
        }
        this.emit('text-delta', event);
        break;
      }

      case 'text-end': {
        // event.id is a text segment ID, but text belongs to the current message (from 'start' event)
        // Text part is complete, but don't mark entire message as complete (message completes on 'finish' event)
        break;
      }

      case 'tool-input-start': {
        // Use messageId from event if available (for child segments), otherwise fall back to currentMessageId
        const messageId =
          'messageId' in event && event.messageId ? event.messageId : this.currentMessageId;
        const toolMessage = messageId ? this.messageStates.get(messageId) : undefined;
        if (toolMessage) {
          const updatedState: MessageState = {
            ...toolMessage,
            toolCalls: [
              ...(toolMessage.toolCalls ?? []),
              {
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                isComplete: false,
              },
            ],
          };
          this.messageStates.set(toolMessage.id, updatedState);
        }
        break;
      }

      case 'tool-input-delta': {
        // Use messageId from event if available (for child segments), otherwise fall back to currentMessageId
        const messageId =
          'messageId' in event && event.messageId ? event.messageId : this.currentMessageId;
        const toolMessage = messageId ? this.messageStates.get(messageId) : undefined;
        if (toolMessage?.toolCalls) {
          const toolCallIndex = toolMessage.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (toolCallIndex !== -1) {
            const existingToolCall = toolMessage.toolCalls[toolCallIndex];
            // Accumulate inputTextDelta into input (stored as string during streaming)
            // When tool-input-available arrives, it will replace this with the parsed object
            const currentInput =
              typeof existingToolCall.input === 'string' ? existingToolCall.input : '';
            const updatedState: MessageState = {
              ...toolMessage,
              toolCalls: toolMessage.toolCalls.map((tc, index) =>
                index === toolCallIndex
                  ? { ...tc, input: currentInput + event.inputTextDelta }
                  : tc,
              ),
            };
            this.messageStates.set(toolMessage.id, updatedState);
          }
        }
        break;
      }

      case 'tool-input-available': {
        // Use messageId from event if available (for child segments), otherwise fall back to currentMessageId
        const messageId =
          'messageId' in event && event.messageId ? event.messageId : this.currentMessageId;
        const toolMessage = messageId ? this.messageStates.get(messageId) : undefined;
        if (toolMessage?.toolCalls) {
          const toolCallIndex = toolMessage.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (toolCallIndex !== -1) {
            const updatedState: MessageState = {
              ...toolMessage,
              toolCalls: toolMessage.toolCalls.map((tc, index) =>
                index === toolCallIndex ? { ...tc, input: event.input } : tc,
              ),
            };
            this.messageStates.set(toolMessage.id, updatedState);
          }
        }
        break;
      }

      case 'tool-output-available': {
        // Use messageId from event if available (for child segments), otherwise fall back to currentMessageId
        const messageId =
          'messageId' in event && event.messageId ? event.messageId : this.currentMessageId;
        const toolMessage = messageId ? this.messageStates.get(messageId) : undefined;
        if (toolMessage?.toolCalls) {
          const toolCallIndex = toolMessage.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (toolCallIndex !== -1) {
            const updatedState: MessageState = {
              ...toolMessage,
              toolCalls: toolMessage.toolCalls.map((tc, index) =>
                index === toolCallIndex ? { ...tc, output: event.output } : tc,
              ),
            };
            this.messageStates.set(toolMessage.id, updatedState);
          }
        }
        break;
      }

      case 'tool-call-end': {
        // Use messageId from event if available (for child segments), otherwise fall back to currentMessageId
        const messageId =
          'messageId' in event && event.messageId ? event.messageId : this.currentMessageId;
        const toolMessage = messageId ? this.messageStates.get(messageId) : undefined;
        if (toolMessage?.toolCalls) {
          const toolCallIndex = toolMessage.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (toolCallIndex !== -1) {
            const updatedState: MessageState = {
              ...toolMessage,
              toolCalls: toolMessage.toolCalls.map((tc, index) =>
                index === toolCallIndex ? { ...tc, isComplete: true } : tc,
              ),
            };
            this.messageStates.set(toolMessage.id, updatedState);
          }
        }
        break;
      }

      case 'finish':
        if (this.currentMessageId) {
          const finishedMessage = this.messageStates.get(this.currentMessageId);
          if (finishedMessage) {
            const updatedState: MessageState = {
              ...finishedMessage,
              isComplete: true,
            };
            this.messageStates.set(this.currentMessageId, updatedState);
          }
        }
        this.emit('finish', event);
        break;

      case 'error':
        this.emit('error', event);
        this.options.onError(new Error(event.errorText));
        break;
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (handler as (...args: any[]) => void)(...args);
        } catch (error) {
          this.options.onError(error instanceof Error ? error : new Error('Handler error'));
        }
      });
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.options.autoReconnect) {
        this.connect();
      }
    }, this.options.reconnectDelay);
  }
}
