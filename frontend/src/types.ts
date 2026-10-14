export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
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

export interface ChatRequestBody {
  model: string;
  useHermesBridge: boolean;
  messages: Message[];
}
