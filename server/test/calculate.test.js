import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

async function withApp(fn) {
  const app = await startTestApp();
  try {
    await fn(app, await app.signIn());
  } finally {
    await app.close();
  }
}

const calc = (app, token, body) => app.call('POST', '/api/invoices/calculate', { token, body });

test('calculating needs a signed-in user', () =>
  withApp(async (app) => {
    const res = await calc(app, null, { debit: '5', credit: '1' });
    assert.equal(res.status, 401);
  }));

test('worked examples from the spec', () =>
  withApp(async (app, token) => {
    const cases = [
      [{ debit: '1,250.00', credit: '400.00' }, 'debit', '850.00'],
      [{ debit: '300.00', credit: '975.50' }, 'credit', '675.50'],
      [{ debit: '500.00', credit: '500.00' }, 'balanced', '0.00'],
      [{ debit: '720.00', credit: null }, 'debit', '720.00'],
      [{ credit: '99.99' }, 'credit', '99.99'],
    ];
    for (const [body, type, net] of cases) {
      const res = await calc(app, token, body);
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(res.body.type, type);
      assert.equal(res.body.net, net);
    }
  }));

test('answers with exact decimal strings and the totals of each side', () =>
  withApp(async (app, token) => {
    const res = await calc(app, token, { debit: '0.30', credit: '0.10' });
    assert.deepEqual(res.body, {
      debit: '0.30',
      credit: '0.10',
      net: '0.20',
      netRounded: '0.20',
      rounded: false,
      signedNet: '0.20',
      type: 'debit',
      lineCount: 2,
    });
    const credit = await calc(app, token, { debit: '1', credit: '3.50' });
    assert.equal(credit.body.net, '2.50');
    assert.equal(credit.body.signedNet, '-2.50');
  }));

test('accepts any amount a person types and keeps every decimal', () =>
  withApp(async (app, token) => {
    const cases = [
      [
        { debit: '12.345', credit: '0' },
        { net: '12.345', netRounded: '12.35', rounded: true },
      ],
      [{ debit: '0.001' }, { net: '0.001', netRounded: '0.00', rounded: true }],
      [
        { debit: '1e3', credit: '250.5' },
        { net: '749.50', netRounded: '749.50', rounded: false },
      ],
      [
        { debit: '₹ 12,34,567.891', credit: 'Rs. 500/-' },
        { net: '1234067.891', netRounded: '1234067.89', rounded: true },
      ],
      [
        { debit: '0.1', credit: '0.3' },
        { net: '0.20', type: 'credit', rounded: false },
      ],
      [
        { debit: '999999999999999.999999999999' },
        { net: '999999999999999.999999999999', netRounded: '1000000000000000.00' },
      ],
      [
        { debit: '0.001', credit: '0.001' },
        { net: '0.00', type: 'balanced', rounded: false },
      ],
    ];
    for (const [body, want] of cases) {
      const res = await calc(app, token, body);
      assert.equal(res.status, 200, JSON.stringify(body));
      for (const [k, v] of Object.entries(want))
        assert.equal(res.body[k], v, `${JSON.stringify(body)} ${k}`);
    }
    const credit = await calc(app, token, { debit: '0.001', credit: '0.002' });
    assert.equal(credit.body.type, 'credit');
    assert.equal(credit.body.signedNet, '-0.001');
  }));

test('totals a list of signed line items', () =>
  withApp(async (app, token) => {
    const items = ['1000.50', '250.00', { description: 'Deposit', amount: '-400.00' }, '', null];
    const res = await calc(app, token, { items });
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'debit');
    assert.equal(res.body.debit, '1250.50');
    assert.equal(res.body.credit, '400.00');
    assert.equal(res.body.net, '850.50');
    assert.equal(res.body.lineCount, 3);

    const many = await calc(app, token, { items: Array(2000).fill('0.01') });
    assert.equal(many.body.net, '20.00');
    const long = await calc(app, token, { items: Array(3).fill('0.004') });
    assert.equal(long.body.net, '0.012');
    assert.equal(long.body.netRounded, '0.01');
  }));

test('refuses missing, negative, imprecise and non-text amounts with a clear message', () =>
  withApp(async (app, token) => {
    const bad = async (body, pattern, extra = {}) => {
      const res = await calc(app, token, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, pattern);
      for (const [k, v] of Object.entries(extra)) assert.equal(res.body[k], v);
    };
    await bad({}, /at least one amount/);
    await bad({ debit: '', credit: ' ' }, /at least one amount/);
    await bad({ debit: '-5', credit: '1' }, /Debit: Amounts cannot be negative/, {
      field: 'debit',
    });
    await bad({ debit: '1', credit: '1.0000000000001' }, /Credit: Use at most 12 decimal places/, {
      field: 'credit',
    });
    await bad({ debit: '1'.repeat(16) }, /Debit: That amount is too large.*15 digits/, {
      field: 'debit',
    });
    await bad({ debit: '1'.repeat(101) }, /too long/);
    await bad({ debit: '£5' }, /rupees/);
    await bad({ items: ['1', '2.0000000000001'] }, /Line 2: Use at most 12 decimal/, { line: 2 });
    await bad({ debit: 'abc' }, /number such as/);
    await bad({ debit: 12.5, credit: '1' }, /as text/);
    await bad({ debit: { amount: 1 } }, /as text/);
    await bad({ items: ['1', 'x'] }, /Line 2/, { line: 2 });
    await bad({ items: [] }, /at least one amount/);
    await bad({ items: Array(5001).fill('1') }, /at most 5000/);
    await bad({ items: '5' }, /list/);
    await bad({ items: [1.5] }, /as text/);
  }));

test('refuses a body that is not an object or not JSON', () =>
  withApp(async (app, token) => {
    assert.equal((await calc(app, token, [1, 2])).status, 400);
    assert.equal((await calc(app, token, 'not json')).status, 400);
    const huge = { items: Array(20000).fill({ description: 'x'.repeat(30), amount: '1.00' }) };
    assert.equal((await calc(app, token, huge)).status, 413);
  }));

test('does not break fetching an invoice picture whose id is "calculate"', () =>
  withApp(async (app, token) => {
    const res = await app.call('GET', '/api/invoices/calculate', { token });
    assert.equal(res.status, 404);
  }));
