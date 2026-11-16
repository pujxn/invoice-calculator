import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DECIMALS,
  MAX_INPUT_LENGTH,
  MAX_WHOLE_DIGITS,
  hasExtraDecimals,
  parseAmount,
  roundToPaise,
  sumAmounts,
  toUnits,
  unitsToString,
} from '../src/index.js';

// What a typed amount comes back as: the exact decimal string, e.g. "12.345".
const read = (text, options) => {
  const r = parseAmount(text, options);
  assert.ok(r.ok, `${text}: ${r.message}`);
  return unitsToString(r.units);
};
const refused = (text, options) => {
  const r = parseAmount(text, options);
  assert.equal(r.ok, false, `${text} should be refused`);
  return r;
};

describe('parseAmount', () => {
  it('reads plain and grouped amounts exactly', () => {
    assert.equal(read('1250'), '1250.00');
    assert.equal(read('1250.5'), '1250.50');
    assert.equal(read('1250.50'), '1250.50');
    assert.equal(read('1,250.50'), '1250.50');
    assert.equal(read('1,250,000'), '1250000.00');
    assert.equal(read('12,50,000.25'), '1250000.25'); // Indian lakh grouping
    assert.equal(read('  42 '), '42.00');
    assert.equal(read('007.1'), '7.10');
    assert.equal(read('5.'), '5.00');
    assert.equal(read('.5'), '0.50');
    assert.equal(read('0.07'), '0.07');
  });

  it('accepts any number of decimals up to the limit, and never rounds them', () => {
    assert.equal(read('12.345'), '12.345');
    assert.equal(read('0.001'), '0.001');
    assert.equal(read('2.675'), '2.675');
    assert.equal(read('1,250.5678'), '1250.5678');
    assert.equal(read('12.345678901234'), '12.345678901234');
    assert.equal(read('0.000000000001'), '0.000000000001'); // 12 decimals, the most allowed
    assert.equal(read('999999999999999.999999999999'), '999999999999999.999999999999');
  });

  it('trailing zeros are not precision, however many there are', () => {
    assert.equal(read('5.00000'), '5.00');
    assert.equal(read('5.0000000000000000000'), '5.00');
    assert.equal(read('1.5000000000000000'), '1.50');
    assert.equal(read('0.0000000000000000000000'), '0.00');
  });

  it('refuses more than 12 significant decimals with a message that says the limit', () => {
    const r = refused('0.0000000000001'); // 13 decimals
    assert.equal(r.reason, 'too_precise');
    assert.match(r.message, /at most 12 decimal places/);
    assert.equal(refused('1.10000000000000000000000001').reason, 'too_precise');
    assert.equal(MAX_DECIMALS, 12);
  });

  it('reads scientific notation exactly', () => {
    assert.equal(read('1e3'), '1000.00');
    assert.equal(read('1E3'), '1000.00');
    assert.equal(read('1.5e3'), '1500.00');
    assert.equal(read('2.5e-1'), '0.25');
    assert.equal(read('1e-3'), '0.001');
    assert.equal(read('12.345e2'), '1234.50');
    assert.equal(read('1e+2'), '100.00');
    assert.equal(refused('1e-13').reason, 'too_precise');
    assert.equal(refused('1e15').reason, 'too_large');
    assert.equal(refused('1e999').reason, 'too_large');
    assert.equal(refused('1e').reason, 'invalid');
    assert.equal(refused('e3').reason, 'invalid');
  });

  it('is tolerant of a pasted rupee mark', () => {
    assert.equal(read('₹1,250.50'), '1250.50');
    assert.equal(read('₹ 12,34,567'), '1234567.00');
    assert.equal(read('Rs. 1,250.50'), '1250.50');
    assert.equal(read('rs 500'), '500.00');
    assert.equal(read('INR 1250'), '1250.00');
    assert.equal(read('Rs. 500/-'), '500.00');
    assert.equal(read('500/-'), '500.00');
    assert.equal(read('-₹5', { allowNegative: true }), '-5.00');
  });

  it('points out other currencies instead of silently treating them as rupees', () => {
    for (const text of ['£50', '$5', '€1,250.50']) {
      const r = refused(text);
      assert.equal(r.reason, 'invalid');
      assert.match(r.message, /rupees/);
    }
  });

  it('treats every kind of zero as 0, never as -0', () => {
    for (const zero of ['0', '0.00', '000', '0.', '-0', '(0.00)']) {
      assert.equal(read(zero, { allowNegative: true }), '0.00');
    }
  });

  it('refuses negatives unless allowed, in every spelling', () => {
    for (const text of ['-5', '−5', '(5.00)', '-₹5']) {
      assert.equal(refused(text).reason, 'negative');
      assert.equal(read(text, { allowNegative: true }), '-5.00');
    }
    assert.equal(read('-0.001', { allowNegative: true }), '-0.001');
  });

  it('refuses things that are not amounts', () => {
    for (const text of [
      '',
      ' ',
      'abc',
      '1.2.3',
      '1,23',
      '1,2345',
      '5-',
      '1 000',
      '12abc',
      '.',
      ',',
      '1e3e3',
    ]) {
      assert.equal(refused(text).reason, 'invalid', text);
    }
    assert.equal(refused(12.5).reason, 'invalid'); // numbers are never accepted
    assert.equal(refused(null).reason, 'invalid');
    assert.equal(refused({}).reason, 'invalid');
  });

  it('refuses input that is absurdly long without choking on it', () => {
    assert.equal(refused('1'.repeat(MAX_INPUT_LENGTH + 1)).reason, 'too_long');
    assert.equal(refused('9'.repeat(100_000)).reason, 'too_long');
    assert.equal(refused('0.' + '1'.repeat(5000)).reason, 'too_long');
  });

  it('handles the largest allowed amount and refuses one digit more', () => {
    assert.equal(read('9'.repeat(MAX_WHOLE_DIGITS)), `${'9'.repeat(MAX_WHOLE_DIGITS)}.00`);
    const r = refused('1' + '0'.repeat(MAX_WHOLE_DIGITS));
    assert.equal(r.reason, 'too_large');
    assert.match(r.message, /at most 15 digits/);
    assert.equal(read('000000000000000000001'), '1.00'); // leading zeros do not count
  });
});

describe('unitsToString', () => {
  it('writes the shortest exact decimal, with at least 2 decimals', () => {
    assert.equal(unitsToString(0n), '0.00');
    assert.equal(unitsToString(toUnits('0.05')), '0.05');
    assert.equal(unitsToString(toUnits('1250.5')), '1250.50');
    assert.equal(unitsToString(toUnits('-0.001')), '-0.001');
    assert.equal(unitsToString(toUnits('12.3450')), '12.345');
  });

  it('round-trips with parseAmount', () => {
    for (const text of ['0.00', '0.01', '99.99', '1250.50', '12.345', '0.000000000001']) {
      assert.equal(read(text), text);
    }
  });
});

describe('toUnits', () => {
  it('reads plain decimal strings with no size limit, and throws on anything else', () => {
    assert.equal(unitsToString(toUnits('9'.repeat(20))), `${'9'.repeat(20)}.00`);
    assert.throws(() => toUnits('1,234'), TypeError);
    assert.throws(() => toUnits('abc'), TypeError);
    assert.throws(() => toUnits('0.0000000000001'), TypeError);
  });
});

describe('sumAmounts', () => {
  it('adds exactly', () => {
    assert.equal(sumAmounts(['0.10', '0.20']), '0.30');
    assert.equal(sumAmounts(['0.001', '0.002']), '0.003');
    assert.equal(sumAmounts(Array(1000).fill('0.01')), '10.00');
    assert.equal(sumAmounts([]), '0.00');
  });
});

describe('rounding for display', () => {
  it('rounds half away from zero, on the exact digits', () => {
    assert.equal(roundToPaise('12.345'), '12.35');
    assert.equal(roundToPaise('2.675'), '2.68'); // a float gives 2.67 here
    assert.equal(roundToPaise('-2.675'), '-2.68');
    assert.equal(roundToPaise('0.005'), '0.01');
    assert.equal(roundToPaise('0.004'), '0.00');
    assert.equal(roundToPaise('-0.004'), '0.00'); // never "-0.00"
    assert.equal(roundToPaise('99.995'), '100.00');
    assert.equal(roundToPaise('250'), '250.00');
  });

  it('knows when there is more than 2 decimals to hide', () => {
    assert.equal(hasExtraDecimals('12.345'), true);
    assert.equal(hasExtraDecimals('0.001'), true);
    assert.equal(hasExtraDecimals('12.30'), false);
    assert.equal(hasExtraDecimals('12.300'), false);
    assert.equal(hasExtraDecimals('12'), false);
  });
});
