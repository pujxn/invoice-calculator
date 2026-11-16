import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MINOR, minorToString, parseAmount } from '../src/index.js';

const minor = (text, options) => {
  const r = parseAmount(text, options);
  assert.ok(r.ok, `${text}: ${r.message}`);
  return r.minor;
};
const refused = (text, options) => {
  const r = parseAmount(text, options);
  assert.equal(r.ok, false, `${text} should be refused`);
  return r;
};

describe('parseAmount', () => {
  it('reads plain and grouped amounts exactly', () => {
    assert.equal(minor('1250'), 125000n);
    assert.equal(minor('1250.5'), 125050n);
    assert.equal(minor('1250.50'), 125050n);
    assert.equal(minor('1,250.50'), 125050n);
    assert.equal(minor('1,250,000'), 125000000n);
    assert.equal(minor('12,50,000.25'), 125000025n); // Indian lakh grouping
    assert.equal(minor('  42 '), 4200n);
    assert.equal(minor('007.1'), 710n);
    assert.equal(minor('5.'), 500n);
    assert.equal(minor('0.07'), 7n);
  });

  it('treats every kind of zero as 0, never as -0', () => {
    for (const zero of ['0', '0.00', '000', '0.', '-0', '(0.00)']) {
      assert.equal(minor(zero, { allowNegative: true }), 0n);
    }
  });

  it('refuses negatives unless allowed, in every spelling', () => {
    for (const text of ['-5', '−5', '(5.00)']) {
      assert.equal(refused(text).reason, 'negative');
      assert.equal(minor(text, { allowNegative: true }), -500n);
    }
  });

  it('refuses things that are not amounts', () => {
    for (const text of ['', ' ', 'abc', '1.2.3', '£50', '1,23', '.5', '1e5', '1,2345', '5-']) {
      assert.equal(refused(text).reason, 'invalid', text);
    }
    assert.equal(refused(12.5).reason, 'invalid'); // numbers are never accepted
    assert.equal(refused(null).reason, 'invalid');
  });

  it('refuses more than 2 decimals, or rounds half away from zero when asked', () => {
    assert.equal(refused('12.345').reason, 'too_precise');
    assert.equal(minor('12.345', { round: true }), 1235n);
    assert.equal(minor('12.344999999999', { round: true }), 1234n);
    assert.equal(minor('0.005', { round: true }), 1n);
    assert.equal(minor('0.004', { round: true }), 0n);
    assert.equal(minor('2.675', { round: true }), 268n); // a float gives 2.67 here
    assert.equal(minor('-2.675', { round: true, allowNegative: true }), -268n);
    assert.equal(minor('1.10000000000000000000000001', { round: true }), 110n);
    assert.equal(minor('5.00000', { round: true }), 500n);
  });

  it('handles the largest allowed amount and refuses one cent more', () => {
    assert.equal(minor('999999999999.99'), MAX_MINOR);
    assert.equal(refused('1000000000000').reason, 'too_large');
    assert.equal(refused('999999999999.995', { round: true }).reason, 'too_large');
    assert.equal(refused('9'.repeat(40)).reason, 'too_large');
  });
});

describe('minorToString', () => {
  it('writes exact decimals', () => {
    assert.equal(minorToString(0n), '0.00');
    assert.equal(minorToString(5n), '0.05');
    assert.equal(minorToString(125050n), '1250.50');
    assert.equal(minorToString(-5n), '-0.05');
    assert.equal(minorToString(MAX_MINOR * 1000n), '999999999999990.00');
  });

  it('round-trips with parseAmount', () => {
    for (const text of ['0.00', '0.01', '99.99', '1250.50', '999999999999.99']) {
      assert.equal(minorToString(minor(text)), text);
    }
  });
});
