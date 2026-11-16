import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBase, apiUrl, normalizeApiBase } from '../src/platform/apiBase.js';
import { api } from '../src/api.js';
import { jsonResponse } from './helpers.jsx';

afterEach(() => vi.unstubAllEnvs());

describe('normalizeApiBase', () => {
  it('treats nothing as "same origin"', () => {
    for (const v of [undefined, null, '', '   ']) expect(normalizeApiBase(v)).toBe('');
  });

  it('keeps a good address and drops trailing slashes and spaces', () => {
    expect(normalizeApiBase(' http://192.168.1.20:4000/ ')).toBe('http://192.168.1.20:4000');
    expect(normalizeApiBase('https://api.example.com//')).toBe('https://api.example.com');
    expect(normalizeApiBase('https://example.com/ledgerly')).toBe('https://example.com/ledgerly');
  });

  it('rejects things that are not a web address, so a typo fails loudly', () => {
    expect(() => normalizeApiBase('192.168.1.20:4000')).toThrow(/not a web address/);
    expect(() => normalizeApiBase('localhost:4000')).toThrow(/http:\/\/ or https:\/\//);
    expect(() => normalizeApiBase('localhost')).toThrow(/not a web address/);
    expect(() => normalizeApiBase('ftp://example.com')).toThrow(/http:\/\/ or https:\/\//);
    expect(() => normalizeApiBase('https://example.com/?x=1')).toThrow(/\? or #/);
  });
});

describe('apiUrl', () => {
  it('is a relative /api path in the browser, where nothing is configured', () => {
    expect(apiBase()).toBe('');
    expect(apiUrl('/auth/me')).toBe('/api/auth/me');
  });

  it('adds the configured server address in front, from VITE_API_BASE_URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://192.168.1.20:4000/');
    expect(apiBase()).toBe('http://192.168.1.20:4000');
    expect(apiUrl('/invoices/abc/image')).toBe('http://192.168.1.20:4000/api/invoices/abc/image');
  });
});

describe('api() with a server address', () => {
  it('sends requests to that server, still with the bearer token and no cookies', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/auth/me', { token: 'tok' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/auth/me');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBeUndefined(); // the API does not use cookies
  });
});
