import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centsToString, parseAmount, sumAmounts, toCents } from '../src/extraction/money.js';

const value = (input) => {
  const r = parseAmount(input);
  assert.ok(r.ok, `expected "${input}" to parse, got ${JSON.stringify(r)}`);
  return r.value;
};
const reason = (input) => {
  const r = parseAmount(input);
  assert.equal(r.ok, false, `expected "${input}" to be refused, got ${JSON.stringify(r)}`);
  return r.reason;
};

test('plain, grouped and symbol-wrapped amounts parse to exact 2-decimal strings', () => {
  const cases = {
    1250: '1250.00',
    1250.5: '1250.50',
    '1250.50': '1250.50',
    0.05: '0.05',
    '007': '7.00',
    '£1,250.50': '1250.50',
    '$ 1,250.50': '1250.50',
    '€1.250,50': '1250.50',
    'GBP 1,250.50': '1250.50',
    '1 250,50': '1250.50',
    '1 250,50': '1250.50',
    "1'250.50": '1250.50',
    '1,250,000': '1250000.00',
    '1.250.000': '1250000.00',
    '12,34,567.00': '1234567.00',
    '₹ 1,23,456': '123456.00',
    '  42  ': '42.00',
    0: '0.00',
    '0,5': '0.50',
    999999999999.99: '999999999999.99',
  };
  for (const [input, expected] of Object.entries(cases))
    assert.equal(value(input), expected, input);
});

test('missing values are null, not zero', () => {
  for (const input of [null, undefined, '', '   ']) assert.equal(value(input), null);
});

test('numbers are accepted without float surprises', () => {
  assert.equal(value(12.5), '12.50');
  assert.equal(value(0.3), '0.30');
  assert.equal(value(1250), '1250.00');
  assert.equal(reason(NaN), 'invalid');
  assert.equal(reason(Infinity), 'invalid');
  assert.equal(reason(0.1 + 0.2), 'too_precise'); // 0.30000000000000004 is not an amount
  assert.equal(reason(1e21), 'invalid'); // "1e+21" is not a plain amount
});

test('an amount that could be read two ways is refused with both readings', () => {
  for (const input of ['1,234', '1.234', '12.345', '£5,000', '999.999']) {
    assert.equal(reason(input), 'ambiguous', input);
  }
  assert.match(parseAmount('1,234').message, /1,234 or 1\.234/);
});

test('looks like a decimal, but too precise, is refused', () => {
  for (const input of ['12.3456', '0.123', '1234.567', '5,0000']) {
    assert.equal(reason(input), 'too_precise', input);
  }
});

test('negative amounts are refused so the user confirms them', () => {
  for (const input of ['-50.00', '(50.00)', '50.00-', '−50', '-0']) {
    assert.equal(reason(input), 'negative', input);
  }
});

test('garbage and impossible amounts are refused', () => {
  for (const input of [
    'abc',
    'N/A',
    '..',
    '.5',
    '1.2.3,4',
    '1,2,3',
    '12.',
    ',50',
    '1,234.56.78',
    {},
    [],
    true,
  ]) {
    assert.equal(reason(input), 'invalid', String(input));
  }
  assert.equal(reason('1000000000000'), 'too_large');
  assert.equal(reason('9'.repeat(30)), 'too_large');
});

test('sums are exact in cents', () => {
  assert.equal(sumAmounts(['0.10', '0.20']), '0.30');
  assert.equal(sumAmounts(['19.99', '0.01']), '20.00');
  assert.equal(sumAmounts(Array(1000).fill('0.01')), '10.00');
  assert.equal(sumAmounts([]), '0.00');
  assert.equal(toCents('1234.5'), 123450n);
  assert.equal(centsToString(5n), '0.05');
  assert.throws(() => toCents('1,234'), TypeError);
});
