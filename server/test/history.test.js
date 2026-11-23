import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

const ME = '+447700900123';
const OTHER = '+447700900456';
const PIC = 'b'.repeat(32);

async function withApp(fn, opts) {
  const app = await startTestApp(opts);
  try {
    await fn(app, await app.signIn(ME));
  } finally {
    await app.close();
  }
}

const save = (app, token, body) => app.call('POST', '/api/history', { token, body });
const list = (app, token, query = '') => app.call('GET', `/api/history${query}`, { token });

test('every history route refuses a visitor who is not signed in', () =>
  withApp(async (app) => {
    const id = '0'.repeat(32);
    assert.equal((await save(app, null, { debit: '5' })).status, 401);
    assert.equal((await list(app, null)).status, 401);
    assert.equal((await app.call('GET', `/api/history/${id}`)).status, 401);
    assert.equal(
      (await app.call('PATCH', `/api/history/${id}`, { body: { debit: '1' } })).status,
      401,
    );
    assert.equal((await app.call('DELETE', `/api/history/${id}`)).status, 401);
    assert.equal((await list(app, 'not-a-real-token')).status, 401);
  }));

test('save, then list, open, change and delete an invoice', () =>
  withApp(async (app, token) => {
    const made = await save(app, token, {
      debit: '1,250.00',
      credit: '400.00',
      imageRef: PIC,
      method: 'ocr',
    });
    assert.equal(made.status, 201);
    const { id } = made.body;
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.deepEqual(
      [made.body.debit, made.body.credit, made.body.net, made.body.netRounded, made.body.type],
      ['1250.00', '400.00', '850.00', '850.00', 'debit'],
    );
    assert.equal(made.body.imageRef, PIC);
    assert.equal(made.body.method, 'ocr');
    assert.equal(made.body.agentId, ME, 'the signed-in agent, set by the server');
    assert.ok(!('owner' in made.body), 'the phone number is not sent back');
    assert.equal(made.body.createdAt, new Date(app.clock.t).toISOString());

    const all = await list(app, token);
    assert.equal(all.status, 200);
    assert.equal(all.body.total, 1);
    assert.deepEqual(all.body.entries, [made.body]);

    assert.deepEqual((await app.call('GET', `/api/history/${id}`, { token })).body, made.body);

    const patched = await app.call('PATCH', `/api/history/${id}`, {
      token,
      body: { debit: '1,250.00', credit: '2000' },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual([patched.body.type, patched.body.net], ['credit', '750.00']);
    assert.equal(patched.body.createdAt, made.body.createdAt);

    assert.equal((await app.call('DELETE', `/api/history/${id}`, { token })).status, 200);
    assert.equal((await app.call('GET', `/api/history/${id}`, { token })).status, 404);
    assert.equal((await list(app, token)).body.total, 0);
  }));

test('the totals come from the server, never from the caller', () =>
  withApp(async (app, token) => {
    const res = await save(app, token, {
      debit: '100',
      credit: '30',
      net: '999999',
      type: 'credit',
      agentId: 'agent-1',
      owner: OTHER,
      id: 'c'.repeat(32),
    });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.net, res.body.type], ['70.00', 'debit']);
    assert.equal(res.body.agentId, ME, 'an agent cannot be attached by asking');
    assert.notEqual(res.body.id, 'c'.repeat(32));
    assert.equal((await list(app, await app.signIn(OTHER))).body.total, 0);
  }));

test('saving the same picture twice is one record, and the second answer is 200', () =>
  withApp(async (app, token) => {
    const first = await save(app, token, {
      debit: '10',
      credit: '1',
      imageRef: PIC,
      method: 'mock',
    });
    const second = await save(app, token, {
      debit: '10',
      credit: '3',
      imageRef: PIC,
      method: 'mock',
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
    assert.equal(second.body.net, '7.00');
    assert.equal((await list(app, token)).body.total, 1);
  }));

test('an invoice typed by hand has no picture reference', () =>
  withApp(async (app, token) => {
    const res = await save(app, token, { debit: '50', method: 'manual' });
    assert.equal(res.status, 201);
    assert.equal(res.body.imageRef, null);
    assert.equal(res.body.method, 'manual');
    assert.equal((await save(app, token, { debit: '51' })).body.method, 'manual', 'the default');
  }));

test('bad input is a 400 that says what is wrong, and saves nothing', () =>
  withApp(async (app, token) => {
    const bad = [
      [{}, /at least one/i, undefined],
      [{ debit: 5 }, /as text/, undefined],
      [{ debit: '5', credit: 7 }, /as text/, undefined],
      [{ debit: '-5' }, /Debit/, 'debit'],
      [{ debit: '5', credit: 'abc' }, /Credit/, 'credit'],
      [{ debit: '5', method: 'psychic' }, /method/, 'method'],
      [{ debit: '5', imageRef: '../../etc/passwd' }, /imageRef/, 'imageRef'],
      [{ debit: '5', imageRef: 12 }, /must be text/, undefined],
    ];
    for (const [body, message, field] of bad) {
      const res = await save(app, token, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, message);
      assert.equal(res.body.field, field);
    }
    assert.equal((await save(app, token, '[1,2]')).status, 400);
    assert.equal((await save(app, token, '{not json')).status, 400);
    assert.equal((await list(app, token)).body.total, 0);
  }));

test('another user’s invoices behave exactly like ones that do not exist', () =>
  withApp(async (app, token) => {
    const { body: mine } = await save(app, token, { debit: '100', credit: '1' });
    const other = await app.signIn(OTHER);
    const missing = await app.call('GET', `/api/history/${'d'.repeat(32)}`, { token: other });
    const theirs = await app.call('GET', `/api/history/${mine.id}`, { token: other });
    assert.equal(theirs.status, 404);
    assert.deepEqual(theirs.body, missing.body);
    assert.equal(
      (await app.call('PATCH', `/api/history/${mine.id}`, { token: other, body: { debit: '5' } }))
        .status,
      404,
    );
    assert.equal(
      (await app.call('DELETE', `/api/history/${mine.id}`, { token: other })).status,
      404,
    );
    assert.equal((await list(app, other)).body.total, 0);
    // The owner still has it, unchanged.
    assert.deepEqual((await app.call('GET', `/api/history/${mine.id}`, { token })).body, mine);
    // Malformed ids are 404 too, not an error.
    assert.equal((await app.call('GET', '/api/history/..%2F..%2Fsecret', { token })).status, 404);
  }));

test('search and filter through the query string', () =>
  withApp(async (app, firstToken) => {
    let token = firstToken;
    // The fake clock starts at 2023-11-14 22:13:20 UTC; each save is a day later.
    for (const body of [
      { debit: '1250.00', credit: '400.00', method: 'ocr' },
      { debit: '300.00', credit: '975.50', method: 'claude' },
      { debit: '500.00', credit: '500.00', method: 'manual' },
    ]) {
      await save(app, token, body);
      app.advance(24 * 60 * 60 * 1000);
      token = await app.signIn(ME); // a session lasts 12 hours, so sign in again each day
    }
    const days = (await list(app, token)).body.entries.map((e) => e.createdAt.slice(0, 10));
    assert.deepEqual(days, ['2023-11-16', '2023-11-15', '2023-11-14']);

    const nets = async (query) => (await list(app, token, query)).body.entries.map((e) => e.net);
    assert.deepEqual(await nets('?type=credit'), ['675.50']);
    assert.deepEqual(await nets('?type=balanced'), ['0.00']);
    assert.deepEqual(await nets('?q=1,250'), ['850.00']);
    assert.deepEqual(await nets('?q=%E2%82%B9975.50'), ['675.50']);
    assert.deepEqual(await nets('?from=2023-11-15&to=2023-11-15'), ['675.50']);
    assert.deepEqual(await nets('?from=2023-11-15'), ['0.00', '675.50']);
    assert.deepEqual(await nets('?to=2023-11-14'), ['850.00']);
    assert.deepEqual(await nets('?from=2023-11-15&type=debit'), []);
    assert.deepEqual(
      await nets('?q=&type=&from=&to='),
      ['0.00', '675.50', '850.00'],
      'empty means no filter',
    );

    const page = await list(app, token, '?limit=2&offset=1');
    assert.deepEqual([page.body.total, page.body.limit, page.body.offset], [3, 2, 1]);
    assert.deepEqual(
      page.body.entries.map((e) => e.net),
      ['675.50', '850.00'],
    );
  }));

test('a filter that makes no sense is a 400', () =>
  withApp(async (app, token) => {
    for (const [query, field] of [
      ['?from=yesterday', 'from'],
      ['?to=2023-02-30', 'to'],
      ['?type=sideways', 'type'],
      ['?from=2023-11-16&to=2023-11-14', 'from'],
    ]) {
      const res = await list(app, token, query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.field, field);
    }
    // Repeated or nested query values are ignored rather than crashing.
    assert.equal((await list(app, token, '?q=1&q=2&type[x]=1')).status, 200);
  }));
