import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNet, describeResult, formatAmount, totalLines } from '../src/index.js';

describe('formatAmount', () => {
  it('writes rupees with the ₹ sign and always 2 decimals', () => {
    assert.equal(formatAmount('0'), '₹0.00');
    assert.equal(formatAmount('7.5'), '₹7.50');
    assert.equal(formatAmount('999.99'), '₹999.99');
    assert.equal(formatAmount('1250.5'), '₹1,250.50');
  });

  it('uses lakh and crore grouping', () => {
    assert.equal(formatAmount('1000.00'), '₹1,000.00');
    assert.equal(formatAmount('12345.00'), '₹12,345.00');
    assert.equal(formatAmount('123456.00'), '₹1,23,456.00');
    assert.equal(formatAmount('1234567.5'), '₹12,34,567.50');
    assert.equal(formatAmount('12345678.9'), '₹1,23,45,678.90');
    assert.equal(formatAmount('999999999999999.99'), '₹99,99,99,99,99,99,999.99');
    assert.equal(formatAmount('2499999999999999950.00'), '₹24,99,99,99,99,99,99,99,950.00');
  });

  it('shows a result with more than 2 decimals rounded, or exactly when asked', () => {
    assert.equal(formatAmount('12.345'), '₹12.35');
    assert.equal(formatAmount('12.345', { exact: true }), '₹12.345');
    assert.equal(formatAmount('0.001'), '₹0.00');
    assert.equal(formatAmount('0.001', { exact: true }), '₹0.001');
    assert.equal(formatAmount('2.675'), '₹2.68');
    assert.equal(formatAmount('99999.995'), '₹1,00,000.00');
    assert.equal(formatAmount('1250.5000', { exact: true }), '₹1,250.50');
  });

  it('keeps a minus sign', () => {
    assert.equal(formatAmount('-1234.5'), '-₹1,234.50');
    assert.equal(formatAmount('-0.001', { exact: true }), '-₹0.001');
    assert.equal(formatAmount('0.05'), '₹0.05');
    assert.equal(formatAmount('007.10'), '₹7.10');
  });

  it('returns text it cannot read as it was', () => {
    assert.equal(formatAmount('abc'), 'abc');
    assert.equal(formatAmount('1.00000000000001'), '1.00000000000001');
  });
});

describe('describeResult', () => {
  const words = (debit, credit) => describeResult(calculateNet({ debit, credit }));

  it('words a Net Debit', () => {
    assert.deepEqual(words('1250', '400'), {
      label: 'Net Debit',
      amount: '₹850.00',
      exact: '₹850.00',
      rounded: false,
      note: null,
      working: 'Debit ₹1,250.00 − Credit ₹400.00 = ₹850.00',
      text: 'Net Debit ₹850.00 (Debit ₹1,250.00 − Credit ₹400.00)',
    });
  });

  it('words a Net Credit with the working showing the minus', () => {
    const r = words('300', '975.5');
    assert.equal(r.label, 'Net Credit');
    assert.equal(r.amount, '₹675.50');
    assert.equal(r.working, 'Debit ₹300.00 − Credit ₹975.50 = −₹675.50');
  });

  it('words Balanced and a one-sided invoice', () => {
    const balanced = words('500', '500');
    assert.equal(balanced.label, 'Balanced');
    assert.equal(balanced.text, 'Balanced ₹0.00 (Debit ₹500.00 − Credit ₹500.00)');
    assert.equal(words('720', null).working, 'Debit ₹720.00 − Credit ₹0.00 = ₹720.00');
  });

  it('says so when the shown figure is rounded, and keeps the exact one in the working', () => {
    assert.deepEqual(words('12.345', null), {
      label: 'Net Debit',
      amount: '₹12.35',
      exact: '₹12.345',
      rounded: true,
      note: 'Shown rounded to 2 decimal places. The exact amount is ₹12.345.',
      working: 'Debit ₹12.345 − Credit ₹0.00 = ₹12.345',
      text: 'Net Debit ₹12.35 (Debit ₹12.345 − Credit ₹0.00, exact amount ₹12.345)',
    });
    const credit = words('0.001', '0.002');
    assert.equal(credit.label, 'Net Credit');
    assert.equal(credit.amount, '₹0.00');
    assert.equal(credit.working, 'Debit ₹0.001 − Credit ₹0.002 = −₹0.001');
  });

  it('describes a total of many lines the same way', () => {
    const r = describeResult(totalLines(['1,00,000.255', '-0.005']));
    assert.equal(r.amount, '₹1,00,000.25');
    assert.equal(r.exact, '₹1,00,000.25');
    assert.equal(r.rounded, false);
  });
});
