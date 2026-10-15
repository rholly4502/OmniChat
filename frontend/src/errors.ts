import { ApiError } from './api';

/**
 * Localized, user-facing message for a failed chat request (frontend
 * decomposition step 9).
 *
 * Kept out of `api.ts` so the transport layer stays free of presentation
 * strings, and injected into `useChat` as its `describeError` callback rather
 * than imported there.
 */
export function describeApiError(err: ApiError): string {
  if (err.status === 401) return 'Autentikasi diperlukan (401). Masukkan API key di sidebar.';
  if (err.status === 429) {
    return err.retryAfter
      ? `Terlalu banyak permintaan (429). Coba lagi dalam ${err.retryAfter} detik.`
      : 'Terlalu banyak permintaan (429). Coba lagi nanti.';
  }
  if (err.status === 400) return 'Permintaan tidak valid (400). Periksa input.';
  return `Backend menolak permintaan (${err.status}).`;
}
