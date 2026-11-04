import type { ModelOption } from './types';

export const API_URL = '/api/chat/stream';
export const MODELS_URL = '/api/models';

export const API_KEY_STORAGE = 'omnichat_api_key';

export const DEFAULT_AGENT_MODELS: ModelOption[] = [
  { id: 'hermes', label: 'Hermes (Default)' },
  { id: 'claude-sonnet', label: 'Claude Sonnet' },
  { id: 'gpt-4o', label: 'GPT-4o' },
];

export const DEFAULT_DIRECT_MODELS: ModelOption[] = [
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 (Free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
];

export const DEFAULT_MODEL = 'hermes';

/**
 * Default persona prompt used when Chill Mode is enabled (persona santai).
 * Written in Indonesian to match the rest of the UI copy; combined with the
 * user's custom system prompt (if any) at request time.
 */
export const CHILL_SYSTEM_PROMPT = [
  'Kamu adalah asisten santai dengan gaya chill vibe: ramah, hangat, dan rileks.',
  'Gunakan bahasa yang mengalir, tidak kaku, dan tidak terlalu formal — sesekali boleh humor ringan.',
  'Tetap jelas, membantu, dan rapi; jawaban disusun agar mudah dibaca tanpa kesan kaku.',
].join('\n');
