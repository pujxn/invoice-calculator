import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

test('auth defaults match the spec', () => {
  const { auth } = loadConfig({});
  assert.equal(auth.otpLength, 6);
  assert.equal(auth.otpTtlMs, 5 * 60 * 1000);
  assert.equal(auth.maxAttempts, 5);
  assert.equal(auth.resendSeconds, 30);
  assert.equal(auth.sessionTtlMs, 12 * 60 * 60 * 1000);
  assert.equal(auth.secret, '');
});

test('AUTH_SECRET and Twilio settings are read from the environment', () => {
  const config = loadConfig({
    AUTH_SECRET: 'abc',
    SMS_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'AC1',
    TWILIO_AUTH_TOKEN: 'tok',
    TWILIO_FROM_NUMBER: '+15550001111',
  });
  assert.equal(config.auth.secret, 'abc');
  assert.deepEqual(config.sms.twilio, {
    accountSid: 'AC1',
    authToken: 'tok',
    fromNumber: '+15550001111',
  });
});

test('createApp fails fast on an unknown or incomplete SMS provider', () => {
  assert.throws(() => createApp(loadConfig({ SMS_PROVIDER: 'pigeon' })), /Unknown SMS_PROVIDER/);
  assert.throws(() => createApp(loadConfig({ SMS_PROVIDER: 'twilio' })), /TWILIO_ACCOUNT_SID/);
});

test('createApp does not advertise Express', async () => {
  const server = createApp(loadConfig({})).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    server.close();
  }
});

test('per-IP limits can be tuned from the environment; bad values fall back', () => {
  const tuned = loadConfig({ AUTH_IP_REQUEST_LIMIT: '1000', AUTH_IP_VERIFY_LIMIT: '7' }).auth
    .limits;
  assert.equal(tuned.requestsPerIpPer15Min, 1000);
  assert.equal(tuned.verifiesPerIpPer15Min, 7);
  const bad = loadConfig({ AUTH_IP_REQUEST_LIMIT: 'abc', AUTH_IP_VERIFY_LIMIT: '-3' }).auth.limits;
  assert.equal(bad.requestsPerIpPer15Min, 20);
  assert.equal(bad.verifiesPerIpPer15Min, 40);
});
