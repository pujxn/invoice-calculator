import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, NATIVE_APP_ORIGINS } from '../src/config.js';
import { startTestApp } from './helpers.js';

test('config: the native app origins are always allowed', () => {
  assert.deepEqual(loadConfig({}).cors.origins, NATIVE_APP_ORIGINS);
  assert.ok(NATIVE_APP_ORIGINS.includes('capacitor://localhost'));
  assert.ok(NATIVE_APP_ORIGINS.includes('https://localhost'));
});

test('config: CORS_ORIGINS adds origins, trims them, drops trailing slashes and "*"', () => {
  const { origins } = loadConfig({
    CORS_ORIGINS: ' https://app.example.com/ , https://other.example.com,*,, https://localhost',
  }).cors;
  assert.ok(origins.includes('https://app.example.com'));
  assert.ok(origins.includes('https://other.example.com'));
  assert.ok(!origins.includes('*'));
  assert.equal(origins.filter((o) => o === 'https://localhost').length, 1);
});

test('a preflight from the iOS app is answered without signing in', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const res = await fetch(`${app.base}/api/invoices/calculate`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'capacitor://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
  assert.match(res.headers.get('access-control-allow-headers'), /Content-Type/);
  assert.match(res.headers.get('access-control-allow-methods'), /DELETE/);
  assert.equal(res.headers.get('vary'), 'Origin');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
});

test('real requests from the Android app origin get the allow header and still need a token', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const noToken = await app.call('GET', '/api/auth/me', {
    headers: { Origin: 'https://localhost' },
  });
  assert.equal(noToken.status, 401);
  assert.equal(noToken.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.match(noToken.headers.get('access-control-expose-headers'), /Retry-After/);

  const token = await app.signIn();
  const ok = await app.call('GET', '/api/auth/me', {
    token,
    headers: { Origin: 'https://localhost' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://localhost');
});

test('an unknown origin gets no permission headers, and a preflight is not approved', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const real = await app.call('GET', '/api/health', {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(real.headers.get('access-control-allow-origin'), null);

  const res = await fetch(`${app.base}/api/auth/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-methods'), null);
});

test('requests with no Origin header (the web app, curl) are untouched', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const res = await app.call('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('vary'), null);
});

test('CORS_ORIGINS lets another site call the API', async (t) => {
  const app = await startTestApp({ env: { CORS_ORIGINS: 'https://app.example.com' } });
  t.after(app.close);
  const res = await app.call('GET', '/api/health', {
    headers: { Origin: 'https://app.example.com' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.com');
});
