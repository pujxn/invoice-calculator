import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNet, calculateTotals, describeResult } from '../src/index.js';

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
  it('reports both amounts and the signed net', () => {
    const r = net('1250.50', '400');
    assert.equal(r.debit, '1250.50');
    assert.equal(r.credit, '400.00');
    assert.equal(r.signedNet, '850.50');
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
    assert.equal(calculateNet({ debit: '1', credit: '1.0000000000001' }).reason, 'too_precise');
    assert.equal(calculateNet({ debit: '1'.repeat(16) }).reason, 'too_large');
  });

  it('reads a number by its text, so a float with stray digits keeps every digit it has', () => {
    assert.equal(net(12.5, 1).net, '11.50');
    // 0.1 + 0.2 is 0.30000000000000004 as a float: 17 decimals, more than are allowed.
    assert.equal(calculateNet({ debit: 0.1 + 0.2, credit: 0 }).reason, 'too_precise');
  });
});

describe('calculateNet: any amount a person types', () => {
  it('keeps every decimal in the exact result and rounds only the display figure', () => {
    const r = net('12.345', '0');
    assert.equal(r.net, '12.345');
    assert.equal(r.netRounded, '12.35');
    assert.equal(r.rounded, true);
    assert.equal(r.type, 'debit');
  });

  it('does not flag a result that already has at most 2 decimals', () => {
    for (const [d, c] of [
      ['1250', '400'],
      ['0.125', '0.025'], // 0.100 exactly
      ['10.005', '0.005'], // 10.000 exactly
    ]) {
      const r = net(d, c);
      assert.equal(r.rounded, false, `${d} - ${c}`);
      assert.equal(r.net, r.netRounded);
    }
  });

  it('is exact with long decimals, where floating point is not', () => {
    assert.equal(net('0.1', '0.3').net, '0.20');
    assert.equal(net('0.3', '0.1').net, '0.20');
    assert.equal(net('1.000000000001', '0.000000000001').net, '1.00');
    assert.equal(net('0.001', '0.002').net, '0.001');
    assert.equal(net('0.001', '0.002').type, 'credit');
    assert.equal(net('0.001', '0.002').netRounded, '0.00');
    assert.equal(net('0.001', '0.001').type, 'balanced');
  });

  it('works with scientific notation and a pasted rupee mark', () => {
    assert.equal(net('1e3', '2.5e2').net, '750.00');
    assert.equal(net('₹ 1,00,000', 'Rs. 250.50/-').net, '99749.50');
  });

  it('keeps every digit of the largest amounts', () => {
    const big = '999999999999999.999999999999';
    assert.equal(net(big, '0.000000000001').net, '999999999999999.999999999998');
    assert.equal(net(big, big).type, 'balanced');
    assert.equal(net(big, '0').netRounded, '1000000000000000.00');
    assert.equal(net(big, '0').rounded, true);
  });
});

describe('calculateNet: exact maths and rounding', () => {
  it('has no list of lines: only a Debit and a Credit', () => {
    const r = net('1250.50', '400.00');
    assert.deepEqual(Object.keys(r).sort(), [
      'credit',
      'debit',
      'net',
      'netRounded',
      'ok',
      'rounded',
      'signedNet',
      'type',
    ]);
  });

  it('is exact where floating point drifts', () => {
    assert.equal(net('0.3', '0.1').net, '0.20');
    assert.equal(net('0.1', '0.3').net, '0.20');
    assert.equal(net('0.1', '0.3').type, 'credit');
    assert.equal(net('10.10', '5.05').net, '5.05');
  });

  it('nets equal amounts to Balanced', () => {
    const r = net('10.10', '10.10');
    assert.equal(r.type, 'balanced');
    assert.equal(r.net, '0.00');
    assert.equal(r.signedNet, '0.00');
  });

  it('names the side that is wrong', () => {
    const r = calculateNet({ debit: '1', credit: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.field, 'credit');
    assert.match(r.message, /^Credit: /);
    assert.equal(calculateNet({ debit: '1'.repeat(16) }).reason, 'too_large');
    assert.equal(calculateNet({ debit: '-1', credit: '1' }).field, 'debit');
  });

  it('keeps every decimal and rounds only the figure shown', () => {
    const r = net('0.012', '0');
    assert.equal(r.net, '0.012');
    assert.equal(r.netRounded, '0.01');
    assert.equal(r.rounded, true);
    assert.equal(net('0.005', '0').netRounded, '0.01');
    assert.equal(net('12.345', '0.345').net, '12.00');
    assert.equal(net('12.345', '0.345').rounded, false);
  });
});

describe('calculateTotals: many invoices, one combined total', () => {
  it('adds every Debit and every Credit, then takes the difference', () => {
    const r = calculateTotals([
      { debit: '1,250.00', credit: '400.00' },
      { debit: '300', credit: '975.50' },
      { debit: '720', credit: '' },
    ]);
    assert.ok(r.ok);
    assert.equal(r.debit, '2270.00');
    assert.equal(r.credit, '1375.50');
    assert.equal(r.type, 'debit');
    assert.equal(r.net, '894.50');
    assert.equal(r.counted, 3);
    assert.deepEqual(r.skipped, []);
  });

  it('is a Net Credit or Balanced when the Credits are bigger or equal', () => {
    assert.equal(calculateTotals([{ debit: '10', credit: '30' }]).type, 'credit');
    const same = calculateTotals([
      { debit: '10', credit: '' },
      { debit: '', credit: '10' },
    ]);
    assert.equal(same.type, 'balanced');
    assert.equal(same.net, '0.00');
  });

  it('keeps every decimal: three invoices of 0.1 make exactly 0.3', () => {
    const r = calculateTotals([{ debit: '0.1' }, { debit: '0.1' }, { debit: '0.1' }]);
    assert.equal(r.debit, '0.30');
    const odd = calculateTotals([{ debit: '12.345' }, { debit: '0.001' }]);
    assert.equal(odd.debit, '12.346');
    assert.equal(odd.rounded, true);
  });

  it('leaves out an invoice that cannot be counted and still totals the rest', () => {
    const r = calculateTotals([
      { debit: '100', credit: '' },
      { debit: 'abc', credit: '5' },
      { debit: '', credit: '' },
      { debit: null, credit: '40' },
    ]);
    assert.ok(r.ok);
    assert.equal(r.counted, 2);
    assert.equal(r.net, '60.00');
    assert.deepEqual(
      r.skipped.map((s) => [s.index, s.reason]),
      [
        [1, 'invalid'],
        [2, 'nothing'],
      ],
    );
  });

  it('says so when nothing can be counted', () => {
    for (const list of [undefined, [], [{ debit: '', credit: '' }], [{ debit: 'x' }]]) {
      const r = calculateTotals(list);
      assert.equal(r.ok, false);
      assert.equal(r.counted, 0);
    }
  });

  it('adds up past the size one amount may have', () => {
    const big = '999999999999999.99';
    const r = calculateTotals([{ debit: big }, { debit: big }, { debit: big }]);
    assert.equal(r.debit, '2999999999999999.97');
  });

  it('is worded as totals in the working and the copied text', () => {
    const words = describeResult(calculateTotals([{ debit: '1250', credit: '400' }]), {
      total: true,
    });
    assert.equal(words.working, 'Total debit ₹1,250.00 − Total credit ₹400.00 = ₹850.00');
    assert.match(words.text, /^Net Debit ₹850\.00 \(Total debit/);
  });
});
