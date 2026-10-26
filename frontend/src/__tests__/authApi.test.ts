import { describe, it, expect, vi } from 'vitest';
import { validateApiKey } from '../authApi';

const MODELS = '/api/models';

function jsonResponse(status: number, body?: unknown): Response {
  return {
    status,
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    json: async () => (body === undefined ? {} : body),
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as Response;
}

describe('validateApiKey', () => {
  it('sends the key in the X-Api-Key header and accepts a 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    const result = await validateApiKey('sk-test', fetchImpl);

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      MODELS,
      expect.objectContaining({ headers: { 'X-Api-Key': 'sk-test' } }),
    );
  });

  it('reports a 401 as a wrong or expired key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401));
    const result = await validateApiKey('bad', fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('maps other statuses to a generic server error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500));
    const result = await validateApiKey('k', fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('500');
  });

  it('surfaces a network failure as unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await validateApiKey('k', fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
