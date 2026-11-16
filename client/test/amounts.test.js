import { describe, expect, it } from 'vitest';
import { AMOUNT_HINT, checkAmount } from '../src/invoices/amounts.js';

describe('checkAmount', () => {
  it.each([
    ['1250', '1250.00'],
    ['1250.5', '1250.50'],
    ['1250.50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['1,250,000', '1250000.00'],
    ['12,50,000', '1250000.00'],
    ['  42 ', '42.00'],
    ['0', '0.00'],
    ['007.1', '7.10'],
    ['5.', '5.00'],
    ['.5', '0.50'],
    ['', ''],
    ['   ', ''],
  ])('accepts %j as %j', (typed, clean) => {
    expect(checkAmount(typed)).toEqual({ ok: true, value: clean });
  });

  it.each([
    ['12.345', '12.345'],
    ['0.001', '0.001'],
    ['2.675', '2.675'],
    ['1e3', '1000.00'],
    ['1.5e-3', '0.0015'],
    ['12,34,567.891', '1234567.891'],
    ['0.123456789012', '0.123456789012'],
    ['5.0000000000000000', '5.00'],
    ['999999999999999.99', '999999999999999.99'],
    ['₹1,250.50', '1250.50'],
    ['Rs. 500/-', '500.00'],
  ])('accepts any amount: %j is kept exactly as %j', (typed, clean) => {
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
    ['abc', /number such as/],
    ['1.2.3', /number such as/],
    ['1,23', /number such as/],
    ['1e', /number such as/],
    ['£50', /rupees/],
    ['$5', /rupees/],
    ['1.0000000000001', /at most 12 decimal places/],
    ['9'.repeat(16), /at most 15 digits/],
    ['1'.repeat(101), /too long/],
  ])('refuses %j with a clear message', (typed, message) => {
    const result = checkAmount(typed);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  it('states the limits it applies', () => {
    expect(AMOUNT_HINT).toMatch(/15 digits/);
    expect(AMOUNT_HINT).toMatch(/12 decimal places/);
    expect(AMOUNT_HINT).toMatch(/₹/);
  });
});
