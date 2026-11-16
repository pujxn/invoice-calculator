import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import RequireAuth from '../src/auth/RequireAuth.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import HomePage from '../src/pages/HomePage.jsx';
import { PICTURE_KEY, READING_KEY, SESSION_KEY } from '../src/storageKeys.js';
import { stubApi, storeSession } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));

const PHONE = '+447700900123';
const reading = {
  invoiceId: 'a'.repeat(32),
  provider: 'claude',
  model: 'claude-test',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'GBP',
  confidence: 'high',
  notes: '',
  warnings: [],
  lineItems: [],
  itemTotals: null,
};

let router; // lets a test press the browser's Back and Forward buttons
function Probe() {
  router = { navigate: useNavigate(), location: useLocation() };
  return null;
}

async function open(stage = 'review') {
  sessionStorage.setItem(
    READING_KEY,
    JSON.stringify({
      phone: PHONE,
      stage,
      result: reading,
      values: { debit: '1250.50', credit: '400.00' },
    }),
  );
  storeSession();
  stubApi({
    'GET /auth/me': [200, { phone: PHONE, expiresAt: 'x' }],
    'POST /auth/logout': [200, { ok: true }],
  });
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Probe />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: stage === 'result' ? 'Final amount' : /Amounts/ });
}

const press = (name) => userEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('the browser Back button', () => {
  it('goes from the final amount back to the amounts, and Forward returns', async () => {
    await open();
    await press('Calculate final amount');
    await screen.findByRole('heading', { name: 'Final amount' });
    expect(router.location.state).toEqual({ stage: 'result' });

    act(() => router.navigate(-1));
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();

    act(() => router.navigate(1));
    expect(await screen.findByRole('heading', { name: 'Final amount' })).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(READING_KEY)).stage).toBe('result');
  });

  it('the Back to the invoice button uses the same history entry', async () => {
    await open();
    await press('Calculate final amount');
    await screen.findByRole('heading', { name: 'Final amount' });
    await press('Back to the invoice');
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toHaveFocus();
    // The entry was popped, not piled up: calculating again and going back still works.
    await press('Calculate final amount');
    await screen.findByRole('heading', { name: 'Final amount' });
    act(() => router.navigate(-1));
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
  });

  it('a result restored after a reload still has a way back', async () => {
    await open('result'); // restored from storage: no history entry of its own
    await press('Back to the invoice');
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
  });

  it('does not throw the user off a restored result screen on first load', async () => {
    await open('result');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Final amount' })).toBeVisible(),
    );
  });
});

describe('coming back to the upload screen', () => {
  it('moves focus to its heading from the amounts and from the result', async () => {
    await open();
    await press('Upload a different invoice');
    expect(await screen.findByRole('heading', { name: 'Upload your invoice' })).toHaveFocus();
  });

  it('does not steal focus the first time the upload screen opens', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: PHONE, expiresAt: 'x' }] });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    const heading = await screen.findByRole('heading', { name: 'Upload your invoice' });
    expect(heading).not.toHaveFocus();
  });
});

describe('signing out', () => {
  it('forgets the amounts and the picture so the next sign-in starts clean', async () => {
    await open();
    sessionStorage.setItem(PICTURE_KEY, JSON.stringify({ id: 'b'.repeat(32), name: 'x.png' }));
    await press('Sign out');
    await waitFor(() => expect(sessionStorage.getItem(READING_KEY)).toBeNull());
    expect(sessionStorage.getItem(PICTURE_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('signs this tab out when another tab signs out', async () => {
    await open();
    localStorage.removeItem(SESSION_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }));
    });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('ignores storage changes that are about something else', async () => {
    await open();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    });
    expect(screen.getByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
  });

  it('a different person signing in on another tab replaces the amounts shown here', async () => {
    await open();
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token: 'tok-other',
        phone: '+447700900999',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }));
    });
    expect(await screen.findByText('+447700900999')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Upload your invoice' })).toBeInTheDocument();
  });
});
