import { gatewayRequest } from '../../genesis-gateway';
import {
  convoNonceCapableHeaders,
  convoNonceHeaders,
  rememberConvoNonceFromCreateResponse,
} from '../convoNonce';

/**
 * API Response types
 */
export interface CreateConversationResponse {
  ok: boolean;
  conversationId: string;
  /**
   * Proof that this client created the conversation. The SDK stores and
   * replays it for you (`../convoNonce.ts`); app code only needs `conversationId`.
   */
  nonce?: string;
}

export const PUBLIC_CONVERSATION_LIST_MAX_IDS = 50;
export const PUBLIC_TRANSCRIPT_MAX_LIMIT = 100;

export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListConversationsResponse {
  ok: true;
  conversations: ConversationSummary[];
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface GetConversationResponse {
  ok: true;
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TranscriptMessage[];
  nextCursor: string | null;
}

/**
 * Configuration for API client
 */
/**
 * The agent's public appearance profile - what the owner set once in the agent
 * settings and the Publish -> Customize tab. Served by
 * GET /agents/:agentId/public-profile so the chat block matches the hosted
 * /a/ page and the website widget without re-typing any of it.
 */
export interface AgentPublicProfile {
  ok: true;
  id: string;
  publicAgentId: string;
  name: string;
  avatar: { type: 'emoji'; value: string } | { type: 'image'; url: string } | null;
  /** Welcome message for an empty chat, or null when the owner left it blank. */
  introduction: string | null;
  /** Starter chips: `text` is the label, `prompt` is what gets sent. */
  conversationStarters: { text: string; prompt: string }[];
  inputPlaceholder: string | null;
  /** Small plain-text line under the chat (legal / disclaimer), or null. */
  footerText: string | null;
  /** Dismissable plain-text banner above the chat, or null. */
  dismissableNotice: string | null;
  preferences: {
    theme: 'light' | 'dark' | 'auto' | null;
    /** Hex accent (already validated server-side) or null. */
    color: string | null;
    /** Custom header title, or null to use the agent name. */
    headerTitle: string | null;
    messageLayout: 'default' | 'bubble';
    showSuggestions: boolean;
    /**
     * The emoji the owner picked for the floating chat button, or null for the
     * default icon. Emoji is the only kind the Customize tab sets today. A
     * gateway from before this field sends no key.
     */
    launcherIcon?: { type: 'emoji'; value: string } | null;
  };
}

export interface ClientOptions {
  /** Base URL for API requests (defaults to relative paths) */
  baseUrl?: string;
}

export interface GetConversationOptions extends ClientOptions {
  /** Load older messages before this id (the previous page's `nextCursor`). */
  cursor?: string;
  /** Page size (1-100). Server default is 50. */
  limit?: number;
}

function isEmptyString(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function uniqueNonEmptyIds(conversationIds: readonly string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of conversationIds) {
    const id = value.trim();
    if (id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Creates a new public agent conversation
 *
 * @param agentId - The agent ID
 * @param options - Optional client configuration
 * @returns Promise resolving to conversation ID
 * @throws Error if conversation creation fails
 *
 * @example
 * ```typescript
 * const { conversationId } = await createConversation('agent-456');
 * ```
 */
export async function createConversation(
  agentId: string,
  options?: ClientOptions,
): Promise<CreateConversationResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }

  const baseUrl = options?.baseUrl ?? '';
  const url = `${baseUrl}/api/taskade/agents/${encodeURIComponent(agentId)}/public-conversations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Declares that this client keeps the returned nonce and replays it on
      // every read, which binds the transcript to this browser.
      ...convoNonceCapableHeaders(),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(
      `Failed to create conversation: ${response.status} ${responseText || 'Unknown error'}`,
    );
  }

  // A successful create body carries the long-lived nonce, so neither error
  // below may quote the body: an app error UI or the error telemetry beacon
  // would otherwise expose it.
  if (!contentType.includes('application/json')) {
    throw new Error(`Invalid response format: expected JSON, got ${contentType}`);
  }

  try {
    const data = JSON.parse(responseText) as CreateConversationResponse;
    rememberConvoNonceFromCreateResponse(data.conversationId, data);
    return data;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON response: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }
}

/**
 * Look up metadata for public conversations whose ids this client already stored.
 *
 * There is no "list every chat for this agent": public conversations have no
 * end-user identity, so an unconstrained list would expose one visitor's chat
 * to another. Persist `conversationId` from `createConversation` (for example
 * with `createPersistentStore`) and pass those ids here. Unknown or foreign
 * ids are omitted from the response, not 404'd.
 *
 * @example
 * ```typescript
 * const { conversations } = await listConversations(agentId, storedIds);
 * ```
 */
export async function listConversations(
  agentId: string,
  conversationIds: readonly string[],
  options?: ClientOptions,
): Promise<ListConversationsResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }

  const ids = uniqueNonEmptyIds(conversationIds);
  if (ids.length === 0) {
    throw new Error(
      'Pass conversation ids the client already stored. Listing every conversation for an agent is not supported because public conversations have no end-user identity.',
    );
  }
  if (ids.length > PUBLIC_CONVERSATION_LIST_MAX_IDS) {
    throw new Error(
      `A maximum of ${PUBLIC_CONVERSATION_LIST_MAX_IDS} conversation ids is allowed per request`,
    );
  }

  // Ids go in the query; the nonces proving them go in a header, never the URL.
  const query = `ids=${ids.map(encodeURIComponent).join(',')}`;
  return gatewayRequest<ListConversationsResponse>(
    `/agents/${encodeURIComponent(agentId)}/public-conversations?${query}`,
    { method: 'GET', headers: convoNonceHeaders(ids) },
    options,
  );
}

/**
 * Read the public transcript of one conversation: user and assistant text only.
 *
 * Tool names, inputs, and outputs are omitted. The first page is the most
 * recent `limit` messages (1-100, server default 50). Pass `cursor` from the
 * previous page's `nextCursor` to load older messages. A guessed id from
 * another app returns 404.
 *
 * @example
 * ```typescript
 * const { messages, nextCursor } = await getConversation(agentId, conversationId);
 * ```
 */
export async function getConversation(
  agentId: string,
  conversationId: string,
  options?: GetConversationOptions,
): Promise<GetConversationResponse> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }
  if (isEmptyString(conversationId)) {
    throw new Error('Conversation ID cannot be empty');
  }

  const params = new URLSearchParams();
  const cursor = options?.cursor?.trim();
  if (cursor != null && cursor.length > 0) {
    params.set('cursor', cursor);
  }
  if (options?.limit != null) {
    const limit = options.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_TRANSCRIPT_MAX_LIMIT) {
      throw new Error(`limit must be an integer between 1 and ${PUBLIC_TRANSCRIPT_MAX_LIMIT}`);
    }
    params.set('limit', String(limit));
  }
  const query = params.toString();
  const path = `/agents/${encodeURIComponent(agentId)}/public-conversations/${encodeURIComponent(conversationId)}`;

  return gatewayRequest<GetConversationResponse>(
    query === '' ? path : `${path}?${query}`,
    { method: 'GET', headers: convoNonceHeaders([conversationId]) },
    options,
  );
}

/**
 * Fetch the agent's public appearance profile (name, avatar, welcome message,
 * starter prompts, placeholder, non-paywalled Customize preferences).
 *
 * Use it to DEFAULT a custom chat UI so it matches what the owner configured;
 * explicit props should still win. Fails with the gateway's error when the
 * agent is not published - fall back to your own copy in that case.
 *
 * @example
 * ```typescript
 * const profile = await getAgentProfile(agentId);
 * const title = profile.preferences.headerTitle ?? profile.name;
 * ```
 */
export async function getAgentProfile(
  agentId: string,
  options?: ClientOptions,
): Promise<AgentPublicProfile> {
  if (isEmptyString(agentId)) {
    throw new Error('Agent ID cannot be empty');
  }
  return gatewayRequest<AgentPublicProfile>(
    `/agents/${encodeURIComponent(agentId)}/public-profile`,
    { method: 'GET' },
    options,
  );
}
