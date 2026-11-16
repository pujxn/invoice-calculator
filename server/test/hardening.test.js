import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configWarnings, loadConfig } from '../src/config.js';
import { describeError, redact, secretsFrom } from '../src/log.js';
import { createUploadStore } from '../src/invoices/store.js';
import { IMAGE_TYPES } from '../src/invoices/fileType.js';
import { startTestApp } from './helpers.js';
import { JPEG } from './samples.js';

// Captures console.error while `fn` runs.
async function captureErrors(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

test('every API answer is private, uncacheable and not guessable by the browser', async () => {
  const app = await startTestApp();
  try {
    for (const [method, url] of [
      ['GET', '/api/health'],
      ['GET', '/api/auth/me'],
      ['POST', '/api/auth/request-otp'],
    ]) {
      const res = await app.call(method, url, { body: method === 'POST' ? {} : undefined });
      assert.equal(res.headers.get('cache-control'), 'no-store', url);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', url);
      assert.equal(res.headers.get('x-powered-by'), null, url);
    }
  } finally {
    await app.close();
  }
});

test('an unknown API address answers 404 in JSON, not an HTML page', async () => {
  const app = await startTestApp();
  try {
    const res = await app.call('GET', '/api/nothing-here');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found.' });
    const post = await app.call('POST', '/api/invoices/calculate/extra', { body: {} });
    assert.equal(post.status, 404);
  } finally {
    await app.close();
  }
});

test('behind a proxy (TRUST_PROXY=1) each visitor gets their own per-IP allowance', async () => {
  const app = await startTestApp({ env: { TRUST_PROXY: '1', AUTH_IP_REQUEST_LIMIT: '2' } });
  try {
    const asVisitor = (ip, n) =>
      app.call('POST', '/api/auth/request-otp', {
        body: { phone: `+44770090${String(n).padStart(4, '0')}` },
        headers: { 'X-Forwarded-For': ip },
      });
    assert.equal((await asVisitor('203.0.113.1', 1)).status, 200);
    assert.equal((await asVisitor('203.0.113.1', 2)).status, 200);
    assert.equal((await asVisitor('203.0.113.1', 3)).status, 429);
    assert.equal((await asVisitor('203.0.113.2', 4)).status, 200, 'another visitor is not blocked');
  } finally {
    await app.close();
  }
});

test('without TRUST_PROXY a forged X-Forwarded-For cannot dodge the per-IP limit', async () => {
  const app = await startTestApp({ env: { AUTH_IP_REQUEST_LIMIT: '2' } });
  try {
    const attempt = (n) =>
      app.call('POST', '/api/auth/request-otp', {
        body: { phone: `+44770091${String(n).padStart(4, '0')}` },
        headers: { 'X-Forwarded-For': `198.51.100.${n}` },
      });
    assert.equal((await attempt(1)).status, 200);
    assert.equal((await attempt(2)).status, 200);
    assert.equal((await attempt(3)).status, 429);
  } finally {
    await app.close();
  }
});

test('TRUST_PROXY accepts only a whole number of proxies', () => {
  assert.equal(loadConfig({}).trustProxy, 0);
  assert.equal(loadConfig({ TRUST_PROXY: '2' }).trustProxy, 2);
  assert.equal(loadConfig({ TRUST_PROXY: 'true' }).trustProxy, 0, '"trust everyone" is refused');
  assert.equal(loadConfig({ TRUST_PROXY: '-1' }).trustProxy, 0);
});

test('redact hides configured secrets and anything shaped like a key', () => {
  assert.equal(redact('bad key sk-ant-api03-AbC_dEf-123 here'), 'bad key [hidden] here');
  assert.equal(redact('token abcdef123456 used', ['abcdef123456']), 'token [hidden] used');
  assert.equal(redact('sid AC' + 'a'.repeat(32)), 'sid [hidden]');
  assert.equal(redact('short', ['abc']), 'short', 'very short values are not treated as secrets');
});

test('describeError gives name, status and message, never headers or stacks', () => {
  const err = Object.assign(new Error('401 invalid x-api-key sk-ant-live-SECRET1'), {
    name: 'AuthenticationError',
    status: 401,
    headers: { authorization: 'Bearer hidden' },
  });
  const line = describeError(err);
  assert.equal(line, 'AuthenticationError (status 401): 401 invalid x-api-key [hidden]');
  assert.ok(!line.includes('Bearer'));
  assert.ok(!line.includes('\n'));
});

test('secretsFrom lists the configured keys and skips empty ones', () => {
  const config = loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-xyz-123', AUTH_SECRET: 'auth-secret-1' });
  assert.deepEqual(secretsFrom(config), ['sk-ant-xyz-123', 'auth-secret-1']);
  assert.deepEqual(secretsFrom(loadConfig({})), []);
});

test('a failing SMS provider is logged without the credentials it echoed', async () => {
  const sms = {
    name: 'twilio',
    async send() {
      throw new Error(
        'Twilio responded 401: bad token sk-ant-leak-1234567 for AC' + 'b'.repeat(32),
      );
    },
  };
  const app = await startTestApp({ sms });
  try {
    const lines = await captureErrors(async () => {
      const res = await app.call('POST', '/api/auth/request-otp', {
        body: { phone: '+447700900123' },
      });
      assert.equal(res.status, 502);
      assert.ok(!JSON.stringify(res.body).includes('Twilio'), 'the user never sees provider text');
    });
    const logged = lines.join('\n');
    assert.match(logged, /SMS send failed \(twilio\)/);
    assert.ok(!logged.includes('sk-ant-leak'), logged);
    assert.ok(!logged.includes('b'.repeat(32)), logged);
  } finally {
    await app.close();
  }
});

test('a failing AI call is logged without the key and the user sees a plain message', async () => {
  const key = 'sk-ant-api03-REALLYSECRETKEY';
  const vision = {
    name: 'claude',
    model: 'm',
    async extract() {
      throw new Error(`401 {"error":"invalid x-api-key ${key}"}`);
    },
  };
  const prepare = async () => ({ data: JPEG, mediaType: 'image/jpeg', width: 1, height: 1 });
  const app = await startTestApp({ vision, prepare, env: { ANTHROPIC_API_KEY: key } });
  try {
    const token = await app.signIn();
    const { body: picture } = await app.upload(token, JPEG, { type: 'image/jpeg' });
    const lines = await captureErrors(async () => {
      const res = await app.call('POST', `/api/invoices/${picture.id}/extract`, { token });
      assert.equal(res.status, 502);
      assert.ok(!JSON.stringify(res.body).includes('sk-ant'));
    });
    assert.ok(!lines.join('\n').includes('REALLYSECRETKEY'), lines.join('\n'));
    assert.ok(lines.join('\n').includes('extract provider_unavailable'));
  } finally {
    await app.close();
  }
});

test('bad JSON from a client is a 400 and is not logged as a server error', async () => {
  const app = await startTestApp();
  try {
    const lines = await captureErrors(async () => {
      const res = await app.call('POST', '/api/auth/verify-otp', {
        body: '{"phone": ',
        headers: { 'Content-Type': 'application/json' },
      });
      assert.equal(res.status, 400);
    });
    assert.deepEqual(lines, [], 'bad JSON from a client is not a server error');
  } finally {
    await app.close();
  }
});

test('production warnings: console SMS, mock AI and a missing AUTH_SECRET', () => {
  assert.deepEqual(configWarnings(loadConfig({})), [], 'a laptop has nothing to warn about');
  const warnings = configWarnings(loadConfig({ NODE_ENV: 'production' }));
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /SMS_PROVIDER=console/);
  assert.match(warnings[1], /VISION_PROVIDER=mock/);
  assert.match(warnings[2], /AUTH_SECRET/);
  const ready = loadConfig({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'twilio',
    ANTHROPIC_API_KEY: 'sk-ant-x',
    AUTH_SECRET: 'long-random-value',
  });
  assert.deepEqual(configWarnings(ready), []);
});

test('sweep also removes the folder of a user whose pictures are all gone', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'store-empty-'));
  try {
    let t = 1_000_000;
    const store = createUploadStore({ dir, ttlMs: 1000, maxPerUser: 5, now: () => t });
    const saved = await store.save('+441', JPEG, IMAGE_TYPES.jpeg);
    assert.equal((await readdir(dir)).length, 1);
    await store.remove('+441', saved.id);
    assert.equal((await readdir(dir)).length, 1, 'the empty folder is still there');
    await store.sweep();
    assert.deepEqual(await readdir(dir), [], 'and the sweep tidies it up');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
