export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  content: string;
  /**
   * Server id of this stored turn. Absent on local drafts and on just-streamed turns
   * until the backend's message-id frame arrives. Used to persist like/dislike feedback.
   */
  id?: string;
  /** Persisted rating for this stored turn ("up" | "down"); undefined when unrated. */
  feedback?: 'up' | 'down';
  /**
   * Progress phase reported by the backend while an assistant reply is still being
   * produced. Absent on user turns, on finished replies and when the heartbeat is off.
   */
  status?: string;
  /**
   * Token usage for this specific turn, attached when the streaming turn completes
   * with a usage frame. Undefined on user turns and on replies the provider did not
   * report usage for (e.g. error/abort before any usage frame arrived). Used to render
   * a per-message cost footnote in the transcript without touching the cumulative total.
   */
  usage?: TokenUsage;
  /**
   * Model id that produced this assistant turn. Attached from the stream's usage
   * frame; used to price the per-message cost footnote with the rate of the model
   * that actually generated the reply, not the model selected at view time (a
   * conversation may span several models).
   */
  model?: string;
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
  /** Dim, calm night palette (Mode Malam). */
  nightMode: boolean;
  /** Focus mode: hides decorative/telemetry chrome for a minimal calm surface. */
  focusMode: boolean;
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
  /** Model the conversation last used (undefined for a local draft). */
  model?: string;
  /** Chat mode the conversation last ran under ("agent" | "direct", undefined for a local draft). */
  mode?: string;
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
  /** Persisted rating for this turn ("up" | "down"); undefined when unrated. */
  feedback?: 'up' | 'down';
}

/** A stored conversation together with its transcript. */
/** Per-model token subtotals within a {@link ConversationUsageSummary}. */
export interface ConversationModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Aggregate token usage across all of the caller's stored conversations (the
 * server's `GET /api/conversations/usage` response).
 */
export interface ConversationUsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  conversationCount: number;
  /** Total 'up' (like) ratings across all stored messages. */
  totalUpFeedback: number;
  /** Total 'down' (dislike) ratings across all stored messages. */
  totalDownFeedback: number;
  byModel: Record<string, ConversationModelUsage>;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}
