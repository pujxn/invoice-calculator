// Where the API lives.
//
// In a browser the app and the API share one address (the Vite proxy in development, one host in
// production), so API paths are relative: "/api/...". A native app is loaded from the phone itself
// (capacitor://localhost or https://localhost), so it must be told the real address. That address
// is baked in at build time from VITE_API_BASE_URL (see `npm run native:sync`).

// Returns the cleaned address ("" when unset). Throws when it is set but not a usable address,
// so a typo shows up straight away instead of as "cannot reach the server".
export function normalizeApiBase(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a web address: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`VITE_API_BASE_URL must start with http:// or https://, not ${url.protocol}`);
  }
  if (url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must not contain ? or #.');
  }
  return value.replace(/\/+$/, '');
}

export function apiBase() {
  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
}

// The full address for an API path such as "/auth/me".
export function apiUrl(path) {
  return `${apiBase()}/api${path}`;
}
