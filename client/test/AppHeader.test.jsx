import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppHeader from '../src/components/AppHeader.jsx';

describe('AppHeader', () => {
  it('links the logo to the home page and renders the actions', () => {
    render(
      <MemoryRouter>
        <AppHeader>
          <button type="button">Sign out</button>
        </AppHeader>
      </MemoryRouter>,
    );
    const home = screen.getByRole('link', { name: 'Ledgerly home' });
    expect(home).toHaveAttribute('href', '/');
    expect(home.querySelector('img')).toHaveAttribute('alt', 'Ledgerly');
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('button', { name: 'Sign out' }),
    );
  });
});
