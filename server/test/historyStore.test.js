import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHistoryStore, HistoryError, parseWhen } from '../src/history/store.js';

const ME = '+919876543210';
const OTHER = '+919876543211';
const DAY = 24 * 60 * 60 * 1000;
const PIC = 'a'.repeat(32);

// A store with a clock the test moves by hand. 2026-11-10 12:00 UTC to begin with.
function makeStore(extra = {}) {
  const clock = { t: Date.parse('2026-11-10T12:00:00Z') };
  const store = createHistoryStore({ now: () => clock.t, ...extra });
  return { store, clock };
}

async function inTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'history-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('save works out the net, the type and the rounded net itself', async () => {
  const { store } = makeStore();
  const { entry, created } = await store.save(ME, {
    debit: '1,250.00',
    credit: '400',
    imageRef: PIC,
    method: 'ocr',
  });
  assert.equal(created, true);
  assert.match(entry.id, /^[0-9a-f]{32}$/);
  assert.equal(entry.debit, '1250.00');
  assert.equal(entry.credit, '400.00');
  assert.equal(entry.net, '850.00');
  assert.equal(entry.netRounded, '850.00');
  assert.equal(entry.type, 'debit');
  assert.equal(entry.imageRef, PIC);
  assert.equal(entry.method, 'ocr');
  assert.equal(entry.agentId, null, 'roles can attach an agent later');
  assert.equal(entry.createdAt, '2026-11-10T12:00:00.000Z');
});

test('net credit, balanced and a missing side', async () => {
  const { store } = makeStore();
  const credit = (await store.save(ME, { debit: '300', credit: '975.50' })).entry;
  assert.deepEqual([credit.type, credit.net], ['credit', '675.50']);
  const balanced = (await store.save(ME, { debit: '500', credit: '500' })).entry;
  assert.deepEqual([balanced.type, balanced.net], ['balanced', '0.00']);
  const debitOnly = (await store.save(ME, { debit: '720' })).entry;
  assert.deepEqual([debitOnly.credit, debitOnly.net], ['0.00', '720.00']);
});

test('any amount is kept exactly, with every decimal', async () => {
  const { store } = makeStore();
  const { entry } = await store.save(ME, { debit: '10.001', credit: '0' });
  assert.equal(entry.net, '10.001');
  assert.equal(entry.netRounded, '10.00');
  const big = (await store.save(ME, { debit: '123456789012345.5', credit: '1' })).entry;
  assert.equal(big.net, '123456789012344.50');
});

test('bad amounts and bad extras are refused with the field named', async () => {
  const { store } = makeStore();
  await assert.rejects(
    store.save(ME, {}),
    (e) => e instanceof HistoryError && /at least one/.test(e.message),
  );
  await assert.rejects(
    store.save(ME, { debit: '-5' }),
    (e) => e instanceof HistoryError && e.field === 'debit',
  );
  await assert.rejects(
    store.save(ME, { debit: '5', credit: 'abc' }),
    (e) => e instanceof HistoryError && e.field === 'credit',
  );
  await assert.rejects(
    store.save(ME, { debit: '5', imageRef: '../etc/passwd' }),
    (e) => e.field === 'imageRef',
  );
  await assert.rejects(
    store.save(ME, { debit: '5', method: 'telepathy' }),
    (e) => e.field === 'method',
  );
  await assert.rejects(
    store.save(ME, { debit: '5', agentId: 'no spaces allowed' }),
    (e) => e.field === 'agentId',
  );
  assert.equal((await store.list(ME)).length, 0, 'nothing was saved');
});

test('saving the same picture again updates its record instead of adding a second', async () => {
  const { store, clock } = makeStore();
  const first = await store.save(ME, { debit: '100', credit: '40', imageRef: PIC, method: 'ocr' });
  clock.t += 60_000;
  const second = await store.save(ME, {
    debit: '100',
    credit: '140',
    imageRef: PIC,
    method: 'ocr',
  });
  assert.equal(second.created, false);
  assert.equal(second.entry.id, first.entry.id);
  assert.equal(second.entry.type, 'credit');
  assert.equal(second.entry.createdAt, first.entry.createdAt, 'the saved date does not move');
  assert.notEqual(second.entry.updatedAt, first.entry.createdAt);
  assert.equal((await store.list(ME)).length, 1);
  // Another owner using the same reference gets a record of their own.
  assert.equal((await store.save(OTHER, { debit: '1', imageRef: PIC })).created, true);
});

test('get, update and remove only reach the owner’s own records', async () => {
  const { store } = makeStore();
  const { entry } = await store.save(ME, { debit: '100', credit: '40' });
  assert.equal(await store.get(OTHER, entry.id), null);
  assert.equal(await store.update(OTHER, entry.id, { debit: '1' }), null);
  assert.equal(await store.remove(OTHER, entry.id), false);
  assert.equal(await store.get(ME, 'not-an-id'), null);

  const changed = await store.update(ME, entry.id, { debit: '100', credit: '100' });
  assert.deepEqual([changed.type, changed.net], ['balanced', '0.00']);
  assert.equal((await store.get(ME, entry.id)).type, 'balanced');
  await assert.rejects(store.update(ME, entry.id, { debit: '', credit: '' }), HistoryError);
  assert.equal(await store.remove(ME, entry.id), true);
  assert.equal(await store.get(ME, entry.id), null);
  assert.equal(await store.remove(ME, entry.id), false);
});

test('list is newest first and null as owner looks across every owner', async () => {
  const { store, clock } = makeStore();
  const a = (await store.save(ME, { debit: '1' })).entry;
  clock.t += DAY;
  const b = (await store.save(OTHER, { debit: '2' })).entry;
  clock.t += DAY;
  const c = (await store.save(ME, { debit: '3' })).entry;
  assert.deepEqual(
    (await store.list(ME)).map((e) => e.id),
    [c.id, a.id],
  );
  assert.deepEqual(
    (await store.list(OTHER)).map((e) => e.id),
    [b.id],
  );
  assert.deepEqual(
    (await store.list(null)).map((e) => e.id),
    [c.id, b.id, a.id],
  );
  assert.equal((await store.get(null, b.id)).id, b.id);
});

async function seeded() {
  const { store, clock } = makeStore();
  const ids = {};
  // Saved at noon UTC on 10, 11, 12, 13 November.
  for (const [name, input] of [
    ['d10', { debit: '1250.00', credit: '400.00', method: 'ocr' }], // net debit 850
    ['d11', { debit: '300.00', credit: '975.50', method: 'claude' }], // net credit 675.50
    ['d12', { debit: '500.00', credit: '500.00', method: 'manual' }], // balanced
    ['d13', { debit: '12,34,567.25', credit: '0', method: 'ocr', agentId: 'agent-7' }], // net debit
  ]) {
    ids[name] = (await store.save(ME, input)).entry.id;
    clock.t += DAY;
  }
  return { store, ids };
}

test('filter by date: a day, a range, and the day edges', async () => {
  const { store, ids } = await seeded();
  const only = async (criteria) => (await store.filter(ME, criteria)).entries.map((e) => e.id);
  assert.deepEqual(await only({ from: '2026-11-11', to: '2026-11-11' }), [ids.d11]);
  assert.deepEqual(await only({ from: '2026-11-11', to: '2026-11-12' }), [ids.d12, ids.d11]);
  assert.deepEqual(await only({ from: '2026-11-12' }), [ids.d13, ids.d12]);
  assert.deepEqual(await only({ to: '2026-11-10' }), [ids.d10]);
  assert.deepEqual(await only({ from: '2026-12-01' }), []);
  // Full times work too: this is what the web app sends for a local day.
  assert.deepEqual(
    await only({ from: '2026-11-11T12:00:00.000Z', to: '2026-11-11T12:00:00.000Z' }),
    [ids.d11],
    'both ends are inclusive',
  );
  assert.deepEqual(
    await only({ from: '2026-11-11T12:00:00.001Z', to: '2026-11-12T11:59:59.999Z' }),
    [],
  );
});

test('filter by type, agent and search text', async () => {
  const { store, ids } = await seeded();
  const only = async (criteria) => (await store.filter(ME, criteria)).entries.map((e) => e.id);
  assert.deepEqual(await only({ type: 'debit' }), [ids.d13, ids.d10]);
  assert.deepEqual(await only({ type: 'credit' }), [ids.d11]);
  assert.deepEqual(await only({ type: 'balanced' }), [ids.d12]);
  assert.deepEqual(await only({ agentId: 'agent-7' }), [ids.d13]);
  // Amounts: commas, the rupee sign and spaces in the search are ignored.
  assert.deepEqual(await only({ q: '1,250' }), [ids.d10]);
  assert.deepEqual(await only({ q: '₹975.50' }), [ids.d11]);
  assert.deepEqual(await only({ q: '1234567' }), [ids.d13]);
  assert.deepEqual(await only({ q: '500' }), [ids.d12]);
  // Words and how it was read.
  assert.deepEqual(await only({ q: 'net credit' }), [ids.d11]);
  assert.deepEqual(await only({ q: 'balanced' }), [ids.d12]);
  assert.deepEqual(await only({ q: 'OCR' }), [ids.d13, ids.d10]);
  assert.deepEqual(await only({ q: 'zzz' }), []);
  // Criteria combine.
  assert.deepEqual(await only({ type: 'debit', q: '1250', from: '2026-11-10', to: '2026-11-10' }), [
    ids.d10,
  ]);
  assert.deepEqual(await only({ type: 'credit', q: '1250' }), []);
});

test('filter pages through the matches and counts them all', async () => {
  const { store, clock } = makeStore();
  for (let i = 1; i <= 7; i += 1) {
    await store.save(ME, { debit: String(i) });
    clock.t += 1000;
  }
  const first = await store.filter(ME, { limit: 3 });
  assert.deepEqual(
    first.entries.map((e) => e.debit),
    ['7.00', '6.00', '5.00'],
  );
  assert.equal(first.total, 7);
  const last = await store.filter(ME, { limit: 3, offset: 6 });
  assert.deepEqual(
    last.entries.map((e) => e.debit),
    ['1.00'],
  );
  assert.equal((await store.filter(ME, { limit: '1000' })).limit, 200, 'the page size is capped');
  assert.equal((await store.filter(ME, {})).limit, 50);
});

test('filter refuses dates that make no sense', async () => {
  const { store } = makeStore();
  for (const bad of [{ from: 'yesterday' }, { to: '2026-13-45' }, { from: '2026-02-30' }]) {
    await assert.rejects(
      store.filter(ME, bad),
      (e) => e instanceof HistoryError && /date/.test(e.message),
    );
  }
  await assert.rejects(store.filter(ME, { from: '2026-11-12', to: '2026-11-10' }), /not be after/);
  await assert.rejects(store.filter(ME, { type: 'sideways' }), (e) => e.field === 'type');
});

test('parseWhen understands a day and a full time, and nothing else', () => {
  assert.equal(parseWhen('2026-11-19', 'from'), Date.parse('2026-11-19T00:00:00Z'));
  assert.equal(parseWhen('2026-11-19', 'to'), Date.parse('2026-11-19T23:59:59.999Z'));
  assert.equal(parseWhen('2026-11-19T05:30:00+05:30', 'from'), Date.parse('2026-11-19T00:00:00Z'));
  for (const bad of ['', '19/11/2026', '2026-11-19 10:00', 5, null, undefined]) {
    assert.ok(Number.isNaN(parseWhen(bad, 'from')), String(bad));
  }
});

test('history is kept in a file and survives a restart', () =>
  inTempDir(async (dir) => {
    const file = path.join(dir, 'nested', 'history.json');
    const one = createHistoryStore({ file });
    const { entry } = await one.save(ME, {
      debit: '100',
      credit: '30',
      imageRef: PIC,
      method: 'ocr',
    });
    await one.save(OTHER, { debit: '5' });
    const another = await one.update(ME, entry.id, { debit: '100', credit: '130' });

    const two = createHistoryStore({ file });
    assert.deepEqual(await two.get(ME, entry.id), another);
    assert.equal((await two.list(ME)).length, 1);
    assert.equal((await two.list(null)).length, 2);
    await two.remove(ME, entry.id);

    const three = createHistoryStore({ file });
    assert.equal(await three.get(ME, entry.id), null);
    assert.equal((await three.list(OTHER)).length, 1);
  }));

test('many saves at once are all written', () =>
  inTempDir(async (dir) => {
    const file = path.join(dir, 'history.json');
    const store = createHistoryStore({ file });
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.save(ME, { debit: String(i + 1) })),
    );
    const reread = createHistoryStore({ file });
    assert.equal((await reread.list(ME)).length, 25);
    const text = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(text.entries.length, 25);
  }));

test('a history file that cannot be read stops the server instead of being overwritten', () =>
  inTempDir(async (dir) => {
    const file = path.join(dir, 'history.json');
    await writeFile(file, '{ this is not json');
    assert.throws(() => createHistoryStore({ file }), /cannot be read/);
    assert.equal(await readFile(file, 'utf8'), '{ this is not json', 'the file was left alone');
  }));

test('there is a limit on how many invoices one owner can keep', async () => {
  const { store } = makeStore({ maxPerOwner: 2 });
  await store.save(ME, { debit: '1' });
  await store.save(ME, { debit: '2' });
  await assert.rejects(store.save(ME, { debit: '3' }), (e) => e.status === 429);
  assert.equal((await store.save(OTHER, { debit: '3' })).created, true);
});
