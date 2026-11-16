import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api.js';
import { jsonResponse } from './helpers.jsx';

describe('api()', () => {
  it('sends JSON bodies and the bearer token, and returns parsed JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await api('/auth/verify-otp', { method: 'POST', body: { a: 1 }, token: 't' });
    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/verify-otp');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer t' });
  });

  it('sends no content type or auth header when there is no body or token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await api('/auth/me');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('throws ApiError with the server message, status and extra data', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(429, { error: 'Slow down', retryAfterSeconds: 7 }),
    );
    await expect(api('/x')).rejects.toMatchObject({
      name: 'Error',
      status: 429,
      message: 'Slow down',
      data: { retryAfterSeconds: 7 },
    });
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }));
    await expect(api('/x')).rejects.toMatchObject({
      status: 500,
      message: 'Something went wrong.',
    });
  });

  it('reports a network failure as status 0 with a friendly message', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api('/x')).rejects.toMatchObject({
      status: 0,
      message: /Cannot reach the server/,
    });
  });
});
