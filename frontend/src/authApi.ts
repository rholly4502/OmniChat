import { MODELS_URL } from './constants';

/**
 * Result of a login attempt.
 */
export interface ValidateResult {
  /** True when the key was accepted by the server. */
  ok: boolean;
  /** User-facing reason when `ok` is false. */
  reason?: string;
}

/**
 * Verifies an API key against the backend by calling the models catalogue. The
 * catalogue is the cheapest authenticated endpoint: it answers 200 for a valid
 * key and 401 for a rejected one, so it is the natural "is this key real?"
 * probe without touching any data.
 *
 * `fetchImpl` is injectable so the test suite can stub network behaviour without
 * a live server.
 */
export async function validateApiKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidateResult> {
  try {
    const res = await fetchImpl(MODELS_URL, {
      headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
    });

    if (res.status === 200) return { ok: true };
    if (res.status === 401) {
      return { ok: false, reason: 'API key salah atau kedaluwarsa.' };
    }
    return { ok: false, reason: `Server menjawab ${res.status}.` };
  } catch {
    return { ok: false, reason: 'Tidak dapat terhubung ke server.' };
  }
}
