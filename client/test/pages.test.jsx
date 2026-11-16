import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import HomePage from '../src/pages/HomePage.jsx';

function renderPage(page) {
  return render(
    <MemoryRouter>
      <AuthProvider>{page}</AuthProvider>
    </MemoryRouter>,
  );
}

describe('branded pages', () => {
  it('login screen shows the logo, tagline and a Ledgerly title', () => {
    renderPage(<LoginPage />);
    expect(screen.getByRole('img', { name: 'Ledgerly' })).toBeInTheDocument();
    expect(screen.getByText('Read the invoice. See the balance.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(document.title).toBe('Sign in · Ledgerly');
  });

  it('login screen still shows the phone form', () => {
    renderPage(<LoginPage />);
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
  });

  it('signed-in home page uses the shared header and no old product name', () => {
    localStorage.setItem(
      'invoice-calculator.session',
      JSON.stringify({
        token: 't',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        phone: '+447700900123',
      }),
    );
    // /auth/me is not reachable in jsdom; a network error keeps the stored session.
    renderPage(<HomePage />);
    // The banner landmark must not be nested in <main>, or assistive tech ignores it.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('banner').closest('main')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ledgerly home' })).toBeInTheDocument();
    expect(document.title).toBe('Ledgerly');
    expect(document.body).not.toHaveTextContent('Invoice Calculator');
  });
});
