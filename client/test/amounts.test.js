import { describe, expect, it } from 'vitest';
import { checkAmount } from '../src/invoices/amounts.js';

describe('checkAmount', () => {
  it.each([
    ['1250', '1250.00'],
    ['1250.5', '1250.50'],
    ['1250.50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['1,250,000', '1250000.00'],
    ['  42 ', '42.00'],
    ['0', '0.00'],
    ['007.1', '7.10'],
    ['5.', '5.00'],
    ['', ''],
    ['   ', ''],
  ])('accepts %j as %j', (typed, clean) => {
    expect(checkAmount(typed)).toEqual({ ok: true, value: clean });
  });

  it('treats a missing value as blank', () => {
    expect(checkAmount(undefined)).toEqual({ ok: true, value: '' });
    expect(checkAmount(null)).toEqual({ ok: true, value: '' });
  });

  it.each([
    ['-5', /negative/],
    ['(5.00)', /negative/],
    ['−5', /negative/],
    ['12.345', /2 decimal/],
    ['abc', /number such as/],
    ['1.2.3', /number such as/],
    ['£50', /number such as/],
    ['1,23', /number such as/],
    ['.5', /number such as/],
    ['1e5', /number such as/],
    ['9'.repeat(13), /too large/],
  ])('refuses %j', (typed, message) => {
    const result = checkAmount(typed);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });
});
