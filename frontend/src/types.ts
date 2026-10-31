export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  content: string;
  /**
   * Progress phase reported by the backend while an assistant reply is still being
   * produced. Absent on user turns, on finished replies and when the heartbeat is off.
   */
  status?: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export type ChatMode = 'agent' | 'direct';

export interface ModelCatalog {
  agent: ModelOption[];
  direct: ModelOption[];
}

export interface ChatSettings {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

/** Token usage reported by the upstream via the streaming endpoint. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatRequestBody {
  model: string;
  useHermesBridge: boolean;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  /** Backend conversation to append to; omitted for a new thread. */
  conversationId?: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Server-side pin state; undefined for a local draft. */
  isPinned?: boolean;
  /** Server-reported cumulative input tokens (undefined for a local draft). */
  promptTokens?: number;
  /** Server-reported cumulative output tokens (undefined for a local draft). */
  completionTokens?: number;
  /** Server-reported cumulative token total (undefined for a local draft). */
  totalTokens?: number;
}

/** One row of the server-side history list, without message bodies. */
export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  model: string;
  /** ISO-8601 timestamp from the API. */
  createdAt: string;
  /** ISO-8601 timestamp from the API. */
  updatedAt: string;
  /** Pin state; pinned conversations sort to the top of the sidebar. */
  isPinned: boolean;
  /** Cumulative input tokens billed to this conversation. */
  promptTokens?: number;
  /** Cumulative output tokens billed to this conversation. */
  completionTokens?: number;
  /** Cumulative prompt + completion tokens. */
  totalTokens?: number;
}

/** One replayed turn inside a {@link ConversationDetail}. */
export interface ConversationMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

/** A stored conversation together with its transcript. */
export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}
