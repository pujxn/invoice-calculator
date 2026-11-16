import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNet, describeResult, formatAmount } from '../src/index.js';

describe('formatAmount', () => {
  it('adds thousands separators and always 2 decimals', () => {
    assert.equal(formatAmount('0', null), '0.00');
    assert.equal(formatAmount('7.5', null), '7.50');
    assert.equal(formatAmount('999.99', null), '999.99');
    assert.equal(formatAmount('1000.00', null), '1,000.00');
    assert.equal(formatAmount('1234567.89', null), '1,234,567.89');
    assert.equal(formatAmount('999999999999.99', null), '999,999,999,999.99');
    assert.equal(formatAmount('2499999999999950.00', null), '2,499,999,999,999,950.00');
  });

  it('puts known currency symbols in front, and unknown codes as text', () => {
    assert.equal(formatAmount('1250.5', 'GBP'), '£1,250.50');
    assert.equal(formatAmount('1250.5', 'gbp'), '£1,250.50');
    assert.equal(formatAmount('5', 'USD'), '$5.00');
    assert.equal(formatAmount('5', 'EUR'), '€5.00');
    assert.equal(formatAmount('1250', 'CHF'), 'CHF 1,250.00');
    assert.equal(formatAmount('1250', null), '1,250.00');
    assert.equal(formatAmount('1250', ''), '1,250.00');
    assert.equal(formatAmount('1250', 'not a code'), '1,250.00');
  });

  it('uses lakh grouping for rupees', () => {
    assert.equal(formatAmount('1234567.5', 'INR'), '₹12,34,567.50');
    assert.equal(formatAmount('123456.00', 'INR'), '₹1,23,456.00');
    assert.equal(formatAmount('12345.00', 'INR'), '₹12,345.00');
    assert.equal(formatAmount('999.00', 'INR'), '₹999.00');
    assert.equal(formatAmount('1234567.5', 'GBP'), '£1,234,567.50');
  });

  it('keeps a minus sign and never rounds', () => {
    assert.equal(formatAmount('-1234.5', 'GBP'), '-£1,234.50');
    assert.equal(formatAmount('0.05', null), '0.05');
    assert.equal(formatAmount('007.10', null), '7.10');
  });

  it('returns text it cannot read as it was', () => {
    assert.equal(formatAmount('abc', 'GBP'), 'abc');
  });
});

describe('describeResult', () => {
  const words = (debit, credit, currency) =>
    describeResult(calculateNet({ debit, credit }), currency);

  it('words a Net Debit', () => {
    assert.deepEqual(words('1250', '400', 'GBP'), {
      label: 'Net Debit',
      amount: '£850.00',
      working: 'Debit £1,250.00 − Credit £400.00 = £850.00',
      text: 'Net Debit £850.00 (Debit £1,250.00 − Credit £400.00)',
    });
  });

  it('words a Net Credit with the working showing the minus', () => {
    const r = words('300', '975.5', null);
    assert.equal(r.label, 'Net Credit');
    assert.equal(r.amount, '675.50');
    assert.equal(r.working, 'Debit 300.00 − Credit 975.50 = −675.50');
  });

  it('words Balanced and a one-sided invoice', () => {
    const balanced = words('500', '500', 'USD');
    assert.equal(balanced.label, 'Balanced');
    assert.equal(balanced.text, 'Balanced $0.00 (Debit $500.00 − Credit $500.00)');
    assert.equal(words('720', null, null).working, 'Debit 720.00 − Credit 0.00 = 720.00');
  });
});
