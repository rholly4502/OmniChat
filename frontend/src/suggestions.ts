/**
 * Quick-start prompts for the empty chat state.
 *
 * These are one-click starters that prefill the composer with a sensible opening
 * prompt for the active mode. They are plain, helpful questions a .NET developer
 * would actually ask — no telemetry, no "feature" framing.
 */

/** A single quick-start suggestion chip. */
export interface ChatSuggestion {
  /** Unique key, used for React lists and test ids. */
  id: string;
  /** Short chip label shown on the button. */
  label: string;
  /** The full prompt text inserted into the composer when chosen. */
  prompt: string;
}

/** Suggestions shown when the agent (Hermes bridge) mode is active. */
const AGENT_SUGGESTIONS: ChatSuggestion[] = [
  {
    id: 'agent-architecture',
    label: 'Rancang microservices',
    prompt: 'Bantu saya menyusun rencana proyek microservices yang terukur: bounded context, transport, dan pola kegagalan.',
  },
  {
    id: 'agent-eventdriven',
    label: 'Event-driven vs request-response',
    prompt: 'Jelaskan perbedaan pola event-driven vs request-response, dan kapan masing-masing lebih tepat.',
  },
  {
    id: 'agent-sql',
    label: 'Migrasi SQL ber-batch',
    prompt: 'Tulis skrip T-SQL migrasi data ber-batch dengan tabel log sementara untuk rollback yang aman.',
  },
];

/** Suggestions shown when the direct (LLM) mode is active. */
const DIRECT_SUGGESTIONS: ChatSuggestion[] = [
  {
    id: 'direct-cleanarch',
    label: 'Clean Architecture .NET',
    prompt: 'Jelaskan konsep Clean Architecture di .NET: lapisan, dependensi, dan kapan harus menerapkannya.',
  },
  {
    id: 'direct-channel',
    label: 'Pola Channel<T>',
    prompt: 'Tulis contoh kode C# memakai pola Channel<T> untuk producer-consumer dengan pembatalan (cancellation).',
  },
  {
    id: 'direct-security',
    label: 'Keamanan web ASP.NET Core',
    prompt: 'Apa saja praktik terbaik keamanan aplikasi web ASP.NET Core (auth, CORS, header keamanan)?',
  },
];

/**
 * Returns the quick-start suggestions for a chat mode.
 *
 * The model label is accepted (and currently unused for selection) so a future
 * per-model tailoring has a stable seam without changing callers.
 */
export function chatSuggestions(useAgent: boolean, _modelLabel?: string): ChatSuggestion[] {
  return useAgent ? AGENT_SUGGESTIONS : DIRECT_SUGGESTIONS;
}
