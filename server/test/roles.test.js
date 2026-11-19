import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { loadConfig, configWarnings, DEMO_SUPERADMIN } from '../src/config.js';
import { createDataStore } from '../src/data/store.js';
import { summarize } from '../src/data/totals.js';

const BOSS = '+919876500001';
const ASHA = '+919876500002';
const RAVI = '+919876500003';

// A server where only the real rule applies: nobody is added automatically.
const strict = (env = {}) =>
  startTestApp({ autoRegister: false, env: { SUPERADMIN_PHONES: BOSS, ...env } });

// Signs in a number that is allowed in, the way a person does.
async function signInAs(app, phone) {
  const res = await app.call('POST', '/api/auth/request-otp', { body: { phone } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const code = app.sent.filter((m) => m.to === phone).at(-1).code;
  const verified = await app.call('POST', '/api/auth/verify-otp', { body: { phone, code } });
  assert.equal(verified.status, 200);
  app.advance(31_000);
  return verified.body.token;
}

const addAgent = (app, token, phone, name) =>
  app.call('POST', '/api/agents', { token, body: { phone, name } });

test('a number that nobody added cannot get a code, and no text is sent', async () => {
  const app = await strict();
  try {
    const res = await app.call('POST', '/api/auth/request-otp', { body: { phone: ASHA } });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /not registered/i);
    assert.equal(app.sent.length, 0);
    const verify = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: ASHA, code: '123456' },
    });
    assert.equal(verify.status, 403);
  } finally {
    await app.close();
  }
});

test('the superadmin signs in from SUPERADMIN_PHONES and /me says who and what role', async () => {
  const app = await strict({ SUPERADMIN_PHONES: `${BOSS}, +91 98765 00009, not-a-number` });
  try {
    assert.deepEqual(app.config.roles.superadmins, [BOSS, '+919876500009']);
    assert.deepEqual(app.config.roles.invalid, ['not-a-number']);
    assert.match(configWarnings(app.config).join('\n'), /not-a-number/);
    const token = await signInAs(app, BOSS);
    const me = await app.call('GET', '/api/auth/me', { token });
    assert.equal(me.body.role, 'superadmin');
    assert.equal(me.body.phone, BOSS);
    assert.equal(me.body.name, 'Superadmin');
  } finally {
    await app.close();
  }
});

test('with nothing set, a local demo has the demo superadmin; real texts and production do not', () => {
  assert.deepEqual(loadConfig({}).roles.superadmins, [DEMO_SUPERADMIN]);
  assert.deepEqual(loadConfig({ SMS_PROVIDER: 'twilio' }).roles.superadmins, []);
  assert.deepEqual(loadConfig({ NODE_ENV: 'production' }).roles.superadmins, []);
  assert.deepEqual(loadConfig({ SUPERADMIN_PHONES: BOSS }).roles.superadmins, [BOSS]);
  // A list that is all mistakes does not quietly fall back to the demo number.
  assert.deepEqual(loadConfig({ SUPERADMIN_PHONES: 'oops' }).roles.superadmins, []);
});

test('the superadmin adds an agent, who can then sign in as an agent', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    const added = await addAgent(app, boss, '+91 98765 00002', '  Asha   Rao ');
    assert.equal(added.status, 201);
    assert.equal(added.body.agent.phone, ASHA);
    assert.equal(added.body.agent.name, 'Asha Rao');
    assert.equal(added.body.agent.active, true);

    const token = await signInAs(app, ASHA);
    const me = await app.call('GET', '/api/auth/me', { token });
    assert.deepEqual([me.body.role, me.body.name], ['agent', 'Asha Rao']);
  } finally {
    await app.close();
  }
});

test('adding an agent checks the number and the name, and refuses duplicates', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    assert.equal((await addAgent(app, boss, 'abc', 'X')).status, 400);
    assert.equal((await addAgent(app, boss, ASHA, '   ')).status, 400);
    assert.equal((await addAgent(app, boss, ASHA, 'x'.repeat(61))).status, 400);
    assert.equal((await addAgent(app, boss, ASHA, 42)).status, 400);
    assert.equal(
      (await addAgent(app, boss, BOSS, 'Me')).status,
      409,
      'a superadmin is not an agent',
    );
    assert.equal((await addAgent(app, boss, ASHA, 'Asha')).status, 201);
    const twice = await addAgent(app, boss, ASHA, 'Asha again');
    assert.equal(twice.status, 409);
    assert.match(twice.body.error, /already an agent \(Asha\)/);
  } finally {
    await app.close();
  }
});

test('only the superadmin manages agents; agents and signed-out callers are refused', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    const asha = await signInAs(app, ASHA);
    for (const [method, url, body] of [
      ['GET', '/api/agents'],
      ['POST', '/api/agents', { phone: RAVI, name: 'Ravi' }],
      ['GET', `/api/agents/${ASHA}`],
      ['DELETE', `/api/agents/${ASHA}`],
    ]) {
      assert.equal((await app.call(method, url, { token: asha, body })).status, 403, url);
      assert.equal((await app.call(method, url, { body })).status, 401, url);
    }
  } finally {
    await app.close();
  }
});

test('only agents process invoices; the superadmin is refused there', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    for (const [method, url, body] of [
      ['POST', '/api/invoices/calculate', { debit: '1', credit: '1' }],
      ['GET', '/api/invoices/reading-methods'],
      ['GET', '/api/entries'],
      ['POST', '/api/entries', { debit: '1', credit: '1' }],
    ]) {
      assert.equal((await app.call(method, url, { token: boss, body })).status, 403, url);
    }
  } finally {
    await app.close();
  }
});

test('an agent saves invoices, sees them newest first with exact totals, and can delete one', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    const asha = await signInAs(app, ASHA);

    const first = await app.call('POST', '/api/entries', {
      token: asha,
      body: { debit: '1,250.50', credit: '400', method: 'ocr' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.entry.debit, '1250.50');
    assert.equal(first.body.entry.credit, '400.00');
    assert.equal(first.body.entry.net, '850.50');
    assert.equal(first.body.entry.type, 'debit');
    assert.equal(first.body.entry.method, 'ocr');
    await app.call('POST', '/api/entries', { token: asha, body: { debit: '0.1', credit: null } });
    const third = await app.call('POST', '/api/entries', {
      token: asha,
      body: { debit: '0.2', credit: '2000.5' },
    });

    const list = await app.call('GET', '/api/entries', { token: asha });
    assert.equal(list.body.entries.length, 3);
    assert.equal(list.body.entries[0].id, third.body.entry.id);
    // Exact: 1250.50 + 0.1 + 0.2 = 1250.80, never 1250.8000000000002.
    assert.deepEqual(list.body.summary, {
      count: 3,
      debit: '1250.80',
      credit: '2400.50',
      net: '1149.70',
      signedNet: '-1149.70',
      type: 'credit',
    });

    const gone = await app.call('DELETE', `/api/entries/${third.body.entry.id}`, { token: asha });
    assert.equal(gone.status, 200);
    assert.equal(gone.body.summary.count, 2);
    assert.equal(gone.body.summary.credit, '400.00');
    assert.equal(
      (await app.call('DELETE', `/api/entries/${third.body.entry.id}`, { token: asha })).status,
      404,
    );
  } finally {
    await app.close();
  }
});

test('saving checks the amounts like the calculation does', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    const token = await signInAs(app, ASHA);
    const save = (body) => app.call('POST', '/api/entries', { token, body });
    assert.equal((await save({})).status, 400, 'at least one amount');
    assert.equal((await save({ debit: 5 })).status, 400, 'numbers must be text');
    assert.equal((await save({ debit: '-5' })).status, 400);
    assert.equal((await save({ debit: '$5' })).status, 400);
    assert.equal((await save({ debit: '5', method: 'telepathy' })).status, 400);
    assert.equal((await save([])).status, 400);
    assert.equal((await app.call('GET', '/api/entries', { token })).body.entries.length, 0);
    // A Debit of 0 and a Credit of 0 is a real, balanced invoice.
    const zero = await save({ debit: '0', credit: '0' });
    assert.equal(zero.status, 201);
    assert.equal(zero.body.entry.type, 'balanced');
  } finally {
    await app.close();
  }
});

test('agents see only their own list, and cannot delete anyone else’s entry', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    await addAgent(app, boss, RAVI, 'Ravi');
    const asha = await signInAs(app, ASHA);
    const ravi = await signInAs(app, RAVI);
    const mine = await app.call('POST', '/api/entries', { token: asha, body: { debit: '10' } });
    await app.call('POST', '/api/entries', { token: ravi, body: { credit: '3' } });

    assert.equal((await app.call('GET', '/api/entries', { token: ravi })).body.entries.length, 1);
    const stolen = await app.call('DELETE', `/api/entries/${mine.body.entry.id}`, { token: ravi });
    assert.equal(stolen.status, 404);
    assert.equal((await app.call('GET', '/api/entries', { token: asha })).body.entries.length, 1);
  } finally {
    await app.close();
  }
});

test('the superadmin sees each agent’s list and totals and an overall total', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    await addAgent(app, boss, RAVI, 'Ravi');
    const asha = await signInAs(app, ASHA);
    const ravi = await signInAs(app, RAVI);
    await app.call('POST', '/api/entries', {
      token: asha,
      body: { debit: '50000', credit: '10000' },
    });
    await app.call('POST', '/api/entries', { token: asha, body: { debit: '1.5' } });
    await app.call('POST', '/api/entries', { token: ravi, body: { credit: '70000.25' } });

    const all = await app.call('GET', '/api/agents', { token: boss });
    assert.equal(all.status, 200);
    const [a, r] = all.body.agents;
    assert.deepEqual(
      [a.name, a.count, a.debit, a.credit, a.net, a.type],
      ['Asha', 2, '50001.50', '10000.00', '40001.50', 'debit'],
    );
    assert.deepEqual(
      [r.name, r.count, r.debit, r.credit, r.net, r.type],
      ['Ravi', 1, '0.00', '70000.25', '70000.25', 'credit'],
    );
    assert.deepEqual(all.body.total, {
      count: 3,
      debit: '50001.50',
      credit: '80000.25',
      net: '29998.75',
      signedNet: '-29998.75',
      type: 'credit',
    });

    const detail = await app.call('GET', `/api/agents/${encodeURIComponent(ASHA)}`, {
      token: boss,
    });
    assert.equal(detail.body.agent.name, 'Asha');
    assert.equal(detail.body.entries.length, 2);
    assert.equal(detail.body.entries[1].debit, '50000.00');
    assert.equal(
      (await app.call('GET', '/api/agents/%2B919999999999', { token: boss })).status,
      404,
    );
    assert.equal((await app.call('GET', '/api/agents/nope', { token: boss })).status, 404);
  } finally {
    await app.close();
  }
});

test('removing an agent signs them out at once, keeps their list in the totals, and adding them back restores it', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    const asha = await signInAs(app, ASHA);
    await app.call('POST', '/api/entries', { token: asha, body: { debit: '100' } });

    const removed = await app.call('DELETE', `/api/agents/${encodeURIComponent(ASHA)}`, {
      token: boss,
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.agent.active, false);
    assert.ok(removed.body.agent.removedAt);
    // The session she already had stops working, and she cannot sign in again.
    assert.equal((await app.call('GET', '/api/auth/me', { token: asha })).status, 401);
    assert.equal(
      (await app.call('POST', '/api/auth/request-otp', { body: { phone: ASHA } })).status,
      403,
    );
    // Her saved invoices stay on file and in the overall total.
    const all = await app.call('GET', '/api/agents', { token: boss });
    assert.equal(all.body.agents[0].active, false);
    assert.equal(all.body.total.debit, '100.00');
    assert.equal(
      (await app.call('DELETE', `/api/agents/${encodeURIComponent(ASHA)}`, { token: boss })).status,
      409,
    );

    const back = await addAgent(app, boss, ASHA, 'Asha R');
    assert.equal(back.status, 200);
    assert.equal(back.body.restored, true);
    assert.equal(back.body.agent.count, 1, 'her earlier list is back');
    assert.equal((await signInAs(app, ASHA)).length > 10, true);
  } finally {
    await app.close();
  }
});

test('agents and saved invoices survive a restart', async () => {
  const app = await strict();
  try {
    const boss = await signInAs(app, BOSS);
    await addAgent(app, boss, ASHA, 'Asha');
    const asha = await signInAs(app, ASHA);
    await app.call('POST', '/api/entries', { token: asha, body: { debit: '12.345' } });

    const again = createDataStore({ file: app.config.data.file });
    assert.equal(again.getAgent(ASHA).name, 'Asha');
    assert.equal(again.listEntries(ASHA)[0].debit, '12.345');
    assert.deepEqual(summarize(again.listEntries()).debit, '12.345');
  } finally {
    await app.close();
  }
});

test('a damaged or unknown data file stops the server instead of being overwritten', async () => {
  const app = await strict();
  try {
    const file = path.join(app.dataDir, 'bad.json');
    await writeFile(file, '{ not json');
    assert.throws(() => createDataStore({ file }), /not valid JSON/);
    await writeFile(file, JSON.stringify({ version: 99, agents: {}, entries: [] }));
    assert.throws(() => createDataStore({ file }), /not a Ledgerly data file/);
    assert.equal(
      await readFile(file, 'utf8'),
      JSON.stringify({ version: 99, agents: {}, entries: [] }),
    );
  } finally {
    await app.close();
  }
});

test('totals add exactly and keep every decimal', () => {
  const s = summarize([
    { debit: '0.10', credit: '0.00' },
    { debit: '0.20', credit: '0.00' },
    { debit: '12.345', credit: '0.001' },
  ]);
  assert.deepEqual([s.debit, s.credit, s.net, s.type], ['12.645', '0.001', '12.644', 'debit']);
  assert.deepEqual(summarize([]), {
    count: 0,
    debit: '0.00',
    credit: '0.00',
    net: '0.00',
    signedNet: '0.00',
    type: 'balanced',
  });
});
