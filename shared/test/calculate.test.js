import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LINES, calculateNet, totalLines } from '../src/index.js';

const net = (debit, credit, options) => {
  const r = calculateNet({ debit, credit }, options);
  assert.ok(r.ok, r.message);
  return r;
};

describe('calculateNet: the worked examples in SPEC.md', () => {
  const examples = [
    ['1,250.00', '400.00', 'debit', '850.00'],
    ['300.00', '975.50', 'credit', '675.50'],
    ['500.00', '500.00', 'balanced', '0.00'],
    ['720.00', null, 'debit', '720.00'],
    [null, '99.99', 'credit', '99.99'],
  ];
  for (const [debit, credit, type, amount] of examples) {
    it(`${debit ?? '(none)'} and ${credit ?? '(none)'} is ${type} ${amount}`, () => {
      const r = net(debit, credit);
      assert.equal(r.type, type);
      assert.equal(r.net, amount);
    });
  }
});

describe('calculateNet', () => {
  it('reports the totals, the signed net and the number of amounts given', () => {
    const r = net('1250.50', '400');
    assert.equal(r.debit, '1250.50');
    assert.equal(r.credit, '400.00');
    assert.equal(r.signedNet, '850.50');
    assert.equal(r.lineCount, 2);
    assert.equal(net('5', undefined).lineCount, 1);
    assert.equal(net('', '5').debit, '0.00');
  });

  it('shows a Net Credit as a positive number, with the sign kept in signedNet', () => {
    const r = net('300', '975.50');
    assert.equal(r.net, '675.50');
    assert.equal(r.signedNet, '-675.50');
  });

  it('treats a missing side as 0 but needs at least one amount', () => {
    for (const none of [null, undefined, '', '   ']) {
      const r = calculateNet({ debit: none, credit: none });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'nothing');
    }
    assert.equal(calculateNet().ok, false);
  });

  it('an explicit zero is an amount: 0 and 0 is Balanced, not "missing"', () => {
    const r = net('0', '0.00');
    assert.equal(r.type, 'balanced');
    assert.equal(r.net, '0.00');
    assert.equal(net('0', null).type, 'balanced');
  });

  it('is exact where floating point is not', () => {
    assert.equal(net('0.30', '0.10').net, '0.20'); // 0.3 - 0.1 = 0.19999999999999998
    assert.equal(net('1.10', '0.10').net, '1.00');
    assert.equal(net('0.10', '0.30').net, '0.20');
    assert.equal(net('1000000.07', '0.01').net, '1000000.06');
  });

  it('handles the largest amounts without losing a digit', () => {
    assert.equal(net('999999999999.99', '0.01').net, '999999999999.98');
    assert.equal(net('999999999999.99', '999999999999.99').type, 'balanced');
    assert.equal(net('0.01', '999999999999.99').net, '999999999999.98');
    assert.equal(net('999999999999.99', null).net, '999999999999.99');
  });

  it('reports the field that is wrong', () => {
    const bad = calculateNet({ debit: '10', credit: 'abc' });
    assert.equal(bad.ok, false);
    assert.equal(bad.field, 'credit');
    assert.match(bad.message, /^Credit: /);
    assert.equal(calculateNet({ debit: '-1', credit: '5' }).field, 'debit');
    assert.equal(calculateNet({ debit: '-1', credit: '5' }).reason, 'negative');
    assert.equal(calculateNet({ debit: '1', credit: '12.345' }).reason, 'too_precise');
    assert.equal(calculateNet({ debit: '1'.repeat(13) }).reason, 'too_large');
  });

  it('reads a number by its text, so a float with stray digits is refused, not rounded', () => {
    assert.equal(net(12.5, 1).net, '11.50');
    assert.equal(calculateNet({ debit: 0.1 + 0.2, credit: 0 }).reason, 'too_precise');
  });

  it('rounds long decimals only when asked to', () => {
    assert.equal(calculateNet({ debit: '10.005', credit: '0' }).reason, 'too_precise');
    assert.equal(net('10.005', '0.004', { round: true }).net, '10.01');
    assert.equal(net('10.999', '0.001', { round: true }).net, '11.00'); // 11.00 - 0.00
  });
});

describe('totalLines: signed line items', () => {
  it('totals debits (positive) and credits (negative)', () => {
    const r = totalLines(['1000.50', '250.00', '-400.00']);
    assert.equal(r.type, 'debit');
    assert.equal(r.debit, '1250.50');
    assert.equal(r.credit, '400.00');
    assert.equal(r.net, '850.50');
    assert.equal(r.lineCount, 3);
  });

  it('gives the same answer as calculateNet for a list of two', () => {
    for (const [d, c] of [
      ['1250.00', '400.00'],
      ['300.00', '975.50'],
      ['5', '5'],
      ['0', '7.77'],
    ]) {
      const a = totalLines([d, `-${c}`]);
      const b = net(d, c);
      assert.deepEqual(
        [a.type, a.net, a.debit, a.credit, a.signedNet],
        [b.type, b.net, b.debit, b.credit, b.signedNet],
      );
    }
  });

  it('accepts objects with an amount, and ignores blank lines', () => {
    const r = totalLines([
      { description: 'Parts', amount: '10.00' },
      '',
      null,
      { amount: '-2.50' },
    ]);
    assert.equal(r.net, '7.50');
    assert.equal(r.lineCount, 2);
  });

  it('adds 0.01 a thousand times to exactly 10.00, where floating point drifts', () => {
    const r = totalLines(Array(1000).fill('0.01'));
    assert.equal(r.net, '10.00');
    // Plain floating point drifts on exactly this sum.
    assert.notEqual(
      Array(1000)
        .fill(0.1)
        .reduce((a, b) => a + b, 0),
      100,
    );
    assert.equal(totalLines(Array(1000).fill('0.10')).net, '100.00');
    assert.equal(totalLines(['0.1', '0.2']).net, '0.30');
  });

  it('totals a long list quickly and exactly, going past the single-amount limit', () => {
    const items = Array.from({ length: MAX_LINES }, (_, i) =>
      i % 2 ? '999999999999.99' : '-0.01',
    );
    const r = totalLines(items);
    assert.equal(r.ok, true);
    assert.equal(r.type, 'debit');
    assert.equal(r.debit, '2499999999999975.00'); // 2500 x 999,999,999,999.99
    assert.equal(r.credit, '25.00'); // 2500 x 0.01
    assert.equal(r.net, '2499999999999950.00');
  });

  it('nets a list that cancels out to Balanced', () => {
    const r = totalLines(['10.10', '-5.05', '-5.05']);
    assert.equal(r.type, 'balanced');
    assert.equal(r.net, '0.00');
    assert.equal(r.signedNet, '0.00');
  });

  it('names the line that is wrong', () => {
    const r = totalLines(['1', '2', 'x']);
    assert.equal(r.ok, false);
    assert.equal(r.line, 3);
    assert.match(r.message, /^Line 3: /);
    assert.equal(totalLines(['1', '2.345']).line, 2);
    assert.equal(totalLines(['1', '1'.repeat(14)]).reason, 'too_large');
  });

  it('rounds each line when asked, not the total', () => {
    // Three lines of 0.004 would total 0.012 -> 0.01; line by line they are each 0.00.
    assert.equal(totalLines(['0.004', '0.004', '0.004'], { round: true }).net, '0.00');
    assert.equal(totalLines(['0.005', '0.005'], { round: true }).net, '0.02');
  });

  it('needs at least one amount, and a real list within the limit', () => {
    assert.equal(totalLines([]).reason, 'nothing');
    assert.equal(totalLines(['', null]).reason, 'nothing');
    assert.equal(totalLines('5').reason, 'invalid');
    assert.equal(totalLines(null).reason, 'invalid');
    assert.equal(totalLines(Array(MAX_LINES + 1).fill('1')).reason, 'too_many');
  });
});
