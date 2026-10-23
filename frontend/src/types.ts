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

export interface ChatRequestBody {
  model: string;
  useHermesBridge: boolean;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
