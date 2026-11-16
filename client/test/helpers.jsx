import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import RequireAuth from '../src/auth/RequireAuth.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import HomePage from '../src/pages/HomePage.jsx';

export const STORAGE_KEY = 'invoice-calculator.session';

export function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Stubs fetch with a router: handlers is { 'METHOD /path': (body, headers) => [status, json] }.
// Returns the mock so tests can inspect calls.
export function stubApi(handlers) {
  const mock = vi.fn(async (url, init = {}) => {
    const key = `${init.method || 'GET'} ${url.replace(/^\/api/, '')}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const result = typeof handler === 'function' ? handler(body, init.headers || {}) : handler;
    if (result instanceof Error) throw result;
    return jsonResponse(...result);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export function storeSession(overrides = {}) {
  const session = {
    token: 'tok-123',
    phone: '+447700900123',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

// Renders the real route table at `route` with the auth provider.
export function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Where />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
