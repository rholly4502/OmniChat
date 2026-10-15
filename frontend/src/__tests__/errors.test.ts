import { describe, it, expect } from 'vitest';
import { ApiError } from '../api';
import { describeApiError } from '../errors';

/**
 * Unit tests for the presentation strings module (frontend decomposition
 * step 9). These pin the exact copy the App tests assert on, so moving the
 * function out of App.tsx cannot silently change what the user reads.
 */
describe('describeApiError', () => {
  it('maps 401 to the API-key hint', () => {
    expect(describeApiError(new ApiError(401))).toBe(
      'Autentikasi diperlukan (401). Masukkan API key di sidebar.',
    );
  });

  it('includes the Retry-After seconds on 429', () => {
    const msg = describeApiError(new ApiError(429, '30'));
    expect(msg).toContain('Terlalu banyak permintaan (429)');
    expect(msg).toContain('30 detik');
  });

  it('omits the countdown on 429 without a Retry-After header', () => {
    const msg = describeApiError(new ApiError(429));
    expect(msg).toContain('Terlalu banyak permintaan (429)');
    expect(msg).not.toContain('detik');
  });

  it('maps 400 to the invalid-input message', () => {
    expect(describeApiError(new ApiError(400))).toBe(
      'Permintaan tidak valid (400). Periksa input.',
    );
  });

  it('falls back to a generic message carrying the status for anything else', () => {
    expect(describeApiError(new ApiError(503))).toBe('Backend menolak permintaan (503).');
  });
});
