import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { normalizePhone } from '../src/auth/phone.js';

const PHONE = '+447700900123';

test('normalizePhone accepts E.164 with common separators and rejects the rest', () => {
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone(' +1 (415) 555-2671 '), '+14155552671');
  for (const bad of [
    '07700900123',
    '+0123456789',
    '+44',
    '+1234567890123456',
    'abc',
    '',
    null,
    42,
  ]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test('request-otp rejects invalid numbers with 400 and sends nothing', async () => {
  const app = await startTestApp();
  try {
    const res = await app.call('POST', '/api/auth/request-otp', { body: { phone: '12345' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /international format/);
    assert.equal(app.sent.length, 0);
  } finally {
    app.close();
  }
});

test('request then verify returns a session token that works until logout', async () => {
  const app = await startTestApp();
  try {
    const req = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(req.status, 200);
    assert.deepEqual(req.body, { ok: true, resendAfterSeconds: 30 });
    assert.equal(app.sent.length, 1);
    assert.equal(app.sent[0].to, PHONE);
    assert.match(app.lastCode(), /^\d{6}$/);

    const ver = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: '+44 7700 900123', code: app.lastCode() },
    });
    assert.equal(ver.status, 200);
    assert.ok(ver.body.token.length >= 43); // 32 bytes, base64url
    assert.equal(new Date(ver.body.expiresAt).getTime(), app.clock.t + 12 * 60 * 60 * 1000);

    const me = await app.call('GET', '/api/auth/me', { token: ver.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.phone, PHONE);

    const out = await app.call('POST', '/api/auth/logout', { token: ver.body.token });
    assert.deepEqual(out.body, { ok: true });
    assert.equal((await app.call('GET', '/api/auth/me', { token: ver.body.token })).status, 401);
  } finally {
    app.close();
  }
});

test('a code is single use', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const code = app.lastCode();
    const body = { phone: PHONE, code };
    assert.equal((await app.call('POST', '/api/auth/verify-otp', { body })).status, 200);
    assert.equal((await app.call('POST', '/api/auth/verify-otp', { body })).status, 401);
  } finally {
    app.close();
  }
});

test('a wrong code returns 401 with tries left, and the right one still works after', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const wrong = app.lastCode() === '000000' ? '111111' : '000000';
    const res = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: wrong },
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /4 tries left/);
    const ok = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: app.lastCode() },
    });
    assert.equal(ok.status, 200);
  } finally {
    app.close();
  }
});

test('after 5 wrong attempts even the correct code is refused until a new one is requested', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const good = app.lastCode();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await app.call('POST', '/api/auth/verify-otp', {
        body: { phone: PHONE, code: wrong },
      });
      assert.equal(res.status, 401);
    }
    const locked = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: good },
    });
    assert.equal(locked.status, 429);

    app.advance(31_000);
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const fresh = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: app.lastCode() },
    });
    assert.equal(fresh.status, 200);
  } finally {
    app.close();
  }
});

test('a code expires after 5 minutes', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    app.advance(5 * 60 * 1000 + 1);
    const res = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: app.lastCode() },
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /expired/);
  } finally {
    app.close();
  }
});

test('a code for one number does not verify another number', async () => {
  const app = await startTestApp();
  try {
    const other = '+14155552671';
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const codeForPhone = app.lastCode();
    // Nothing was requested for `other`, so PHONE's code must not sign it in.
    const res = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: other, code: codeForPhone },
    });
    assert.equal(res.status, 401);
  } finally {
    app.close();
  }
});

test('resend is limited to once per 30 seconds per number', async () => {
  const app = await startTestApp();
  try {
    const first = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(first.status, 200);
    app.advance(10_000);
    const early = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(early.status, 429);
    assert.equal(early.body.retryAfterSeconds, 20);
    assert.equal(early.headers.get('retry-after'), '20');
    assert.equal(app.sent.length, 1);

    app.advance(20_000);
    assert.equal(
      (await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } })).status,
      200,
    );
    assert.equal(app.sent.length, 2);
  } finally {
    app.close();
  }
});

test('a number can request at most 5 codes per hour', async () => {
  const app = await startTestApp();
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal(
        (await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } })).status,
        200,
      );
      app.advance(31_000);
    }
    const sixth = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(sixth.status, 429);
    assert.match(sixth.body.error, /Too many code requests/);
    app.advance(60 * 60 * 1000);
    assert.equal(
      (await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } })).status,
      200,
    );
  } finally {
    app.close();
  }
});

test('requests per IP are limited across different numbers', async () => {
  const app = await startTestApp();
  try {
    for (let i = 0; i < 20; i++) {
      const phone = `+4477009${String(i).padStart(5, '0')}`;
      assert.equal(
        (await app.call('POST', '/api/auth/request-otp', { body: { phone } })).status,
        200,
      );
    }
    const res = await app.call('POST', '/api/auth/request-otp', {
      body: { phone: '+447700911111' },
    });
    assert.equal(res.status, 429);
    assert.ok(res.body.retryAfterSeconds > 0);
  } finally {
    app.close();
  }
});

test('a failed SMS send returns 502 and does not start the resend cooldown', async () => {
  let fail = true;
  const sms = {
    name: 'broken',
    async send() {
      if (fail) throw new Error('boom');
    },
  };
  const app = await startTestApp({ sms });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(res.status, 502);
    fail = false;
    assert.equal(
      (await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } })).status,
      200,
    );
  } finally {
    console.error = originalError;
    app.close();
  }
});

test('protected routes reject missing, malformed and unknown tokens', async () => {
  const app = await startTestApp();
  try {
    assert.equal((await app.call('GET', '/api/auth/me')).status, 401);
    assert.equal(
      (await app.call('GET', '/api/auth/me', { headers: { Authorization: 'Token abc' } })).status,
      401,
    );
    assert.equal(
      (await app.call('GET', '/api/auth/me', { token: 'not-a-real-token' })).status,
      401,
    );
    assert.equal((await app.call('POST', '/api/auth/logout')).status, 401);
  } finally {
    app.close();
  }
});

test('a session expires after 12 hours', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    const { body } = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: app.lastCode() },
    });
    app.advance(12 * 60 * 60 * 1000 - 1000);
    assert.equal((await app.call('GET', '/api/auth/me', { token: body.token })).status, 200);
    app.advance(2000);
    assert.equal((await app.call('GET', '/api/auth/me', { token: body.token })).status, 401);
  } finally {
    app.close();
  }
});

test('bad bodies get 400 with an error message', async () => {
  const app = await startTestApp();
  try {
    const noCode = await app.call('POST', '/api/auth/verify-otp', { body: { phone: PHONE } });
    assert.equal(noCode.status, 400);
    const badJson = await app.call('POST', '/api/auth/request-otp', { body: '{nope' });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.error, 'Request body is not valid JSON.');
  } finally {
    app.close();
  }
});

test('verify-otp trims whitespace around the code and accepts a spaced phone number', async () => {
  const app = await startTestApp();
  try {
    await app.call('POST', '/api/auth/request-otp', { body: { phone: '+44 (7700) 900-123' } });
    assert.equal(app.sent[0].to, PHONE);
    const res = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: ` ${app.lastCode()} ` },
    });
    assert.equal(res.status, 200);
  } finally {
    app.close();
  }
});

test('verify-otp rejects non-string, non-numeric and missing input with 400', async () => {
  const app = await startTestApp();
  try {
    for (const body of [
      { phone: PHONE, code: 123456 },
      { phone: PHONE, code: '12ab56' },
      { phone: PHONE, code: '' },
      { code: '123456' },
      { phone: 'nope', code: '123456' },
      {},
    ]) {
      const res = await app.call('POST', '/api/auth/verify-otp', { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(typeof res.body.error, 'string');
    }
  } finally {
    app.close();
  }
});

test('request-otp rejects a missing or non-string phone', async () => {
  const app = await startTestApp();
  try {
    for (const body of [{}, { phone: null }, { phone: 4477009 }, { phone: ['+447700900123'] }]) {
      assert.equal((await app.call('POST', '/api/auth/request-otp', { body })).status, 400);
    }
    assert.equal(app.sent.length, 0);
  } finally {
    app.close();
  }
});

test('verify attempts per IP are limited', async () => {
  const app = await startTestApp();
  try {
    for (let i = 0; i < 40; i++) {
      const res = await app.call('POST', '/api/auth/verify-otp', {
        body: { phone: PHONE, code: '000000' },
      });
      assert.equal(res.status, 401);
    }
    const res = await app.call('POST', '/api/auth/verify-otp', {
      body: { phone: PHONE, code: '000000' },
    });
    assert.equal(res.status, 429);
    assert.ok(res.headers.get('retry-after'));
  } finally {
    app.close();
  }
});

test('two sign-ins give independent sessions; logging out one leaves the other', async () => {
  const app = await startTestApp();
  try {
    const tokens = [];
    for (const phone of [PHONE, '+14155552671']) {
      await app.call('POST', '/api/auth/request-otp', { body: { phone } });
      const res = await app.call('POST', '/api/auth/verify-otp', {
        body: { phone, code: app.lastCode() },
      });
      tokens.push(res.body.token);
    }
    await app.call('POST', '/api/auth/logout', { token: tokens[0] });
    assert.equal((await app.call('GET', '/api/auth/me', { token: tokens[0] })).status, 401);
    const me = await app.call('GET', '/api/auth/me', { token: tokens[1] });
    assert.equal(me.body.phone, '+14155552671');
  } finally {
    app.close();
  }
});

test('responses never contain the code or other secrets', async () => {
  const app = await startTestApp();
  try {
    const res = await app.call('POST', '/api/auth/request-otp', { body: { phone: PHONE } });
    assert.equal(JSON.stringify(res.body).includes(app.lastCode()), false);
  } finally {
    app.close();
  }
});
