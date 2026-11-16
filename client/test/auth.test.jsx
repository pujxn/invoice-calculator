import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, storeSession, stubApi, STORAGE_KEY } from './helpers.jsx';

const where = () => screen.getByTestId('where').textContent;

describe('route protection and session restore', () => {
  it('sends a signed-out visitor to /login', async () => {
    stubApi({});
    renderApp('/');
    await waitFor(() => expect(where()).toBe('/login'));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the protected page once a stored token is confirmed by the server', async () => {
    storeSession();
    const fetchMock = stubApi({
      'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }],
    });
    renderApp('/');
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(await screen.findByText('+447700900123')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
  });

  it('clears a stored token the server rejects and goes to /login', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [401, { error: 'Please sign in.' }] });
    renderApp('/');
    await waitFor(() => expect(where()).toBe('/login'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores a stored session that has already expired, without calling the server', async () => {
    storeSession({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const fetchMock = stubApi({});
    renderApp('/');
    await waitFor(() => expect(where()).toBe('/login'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores corrupt stored data', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    stubApi({});
    renderApp('/');
    await waitFor(() => expect(where()).toBe('/login'));
  });

  it('keeps the session when the check fails for a non-401 reason (server down)', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [500, { error: 'boom' }] });
    renderApp('/');
    expect(await screen.findByText('+447700900123')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('signs out: clears storage, calls logout with the token, and returns to /login', async () => {
    storeSession();
    const fetchMock = stubApi({
      'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }],
      'POST /auth/logout': [200, { ok: true }],
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(where()).toBe('/login'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const logout = fetchMock.mock.calls.find(([url]) => url === '/api/auth/logout');
    expect(logout[1].headers.Authorization).toBe('Bearer tok-123');
  });

  it('still signs out locally when the logout call fails', async () => {
    storeSession();
    stubApi({
      'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }],
      'POST /auth/logout': new TypeError('offline'),
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(where()).toBe('/login'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('redirects a signed-in user away from /login', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    renderApp('/login');
    await waitFor(() => expect(where()).toBe('/'));
  });
});
