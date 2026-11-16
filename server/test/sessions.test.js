import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/auth/sessions.js';

test('creates unique url-safe tokens of 32 random bytes and looks them up', () => {
  const store = createSessionStore({ ttlMs: 1000, now: () => 0 });
  const a = store.create('+447700900123');
  const b = store.create('+447700900123');
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(store.get(a.token).phone, '+447700900123');
  assert.equal(a.expiresAt, new Date(1000).toISOString());
});

test('unknown, empty and non-string tokens are rejected', () => {
  const store = createSessionStore({ ttlMs: 1000 });
  for (const bad of ['nope', '', null, undefined, 42, {}]) assert.equal(store.get(bad), null);
});

test('expires exactly at the ttl', () => {
  let t = 0;
  const store = createSessionStore({ ttlMs: 1000, now: () => t });
  const { token } = store.create('+447700900123');
  t = 999;
  assert.ok(store.get(token));
  t = 1000;
  assert.equal(store.get(token), null);
});

test('destroy ends one session and ignores bad input', () => {
  const store = createSessionStore({ ttlMs: 1000 });
  const a = store.create('+1');
  const b = store.create('+2');
  store.destroy(a.token);
  store.destroy(undefined);
  assert.equal(store.get(a.token), null);
  assert.ok(store.get(b.token));
});

test('sweep removes expired sessions', () => {
  let t = 0;
  const store = createSessionStore({ ttlMs: 1000, now: () => t });
  const old = store.create('+1');
  t = 800;
  const fresh = store.create('+2');
  t = 1200;
  store.sweep();
  assert.equal(store.get(old.token), null);
  assert.ok(store.get(fresh.token));
});
