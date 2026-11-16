import { apiUrl } from './platform/apiBase.js';
import { isNative } from './platform/platform.js';

// Thin fetch wrapper for the JSON API. Throws ApiError with the server's message.
export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, token, signal } = {}) {
  assertNativeHasServer();
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err; // the caller cancelled; not a network problem
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong.', data);
  return data;
}

// A phone app has no server of its own, so an app built without an address can only fail.
// Say so plainly instead of "cannot reach the server".
export function assertNativeHasServer() {
  if (isNative() && !apiUrl('').startsWith('http')) {
    throw new ApiError(
      0,
      'This app was built without a server address. Rebuild it with npm run native:sync.',
    );
  }
}
