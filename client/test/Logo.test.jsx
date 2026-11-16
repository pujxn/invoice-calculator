import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Logo from '../src/components/Logo.jsx';

describe('Logo', () => {
  it('shows the lockup with the product name as alt text', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: 'Ledgerly' });
    expect(img).toHaveAttribute('src', '/brand/logo.svg');
    expect(img).toHaveAttribute('height', '40');
    expect(img).toHaveAttribute('width', '158'); // 253:64 lockup ratio
  });

  it('offers the dark variant for dark colour schemes', () => {
    const { container } = render(<Logo />);
    const source = container.querySelector('source');
    expect(source).toHaveAttribute('media', '(prefers-color-scheme: dark)');
    expect(source).toHaveAttribute('srcset', '/brand/logo-dark.svg');
  });

  it('shows the square mark on its own', () => {
    const { container } = render(<Logo mark height={32} />);
    const img = screen.getByRole('img', { name: 'Ledgerly' });
    expect(img).toHaveAttribute('src', '/brand/logo-mark.svg');
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(container.querySelector('source')).toHaveAttribute(
      'srcset',
      '/brand/logo-mark-dark.svg',
    );
  });
});
