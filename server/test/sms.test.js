import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmsProvider } from '../src/sms/index.js';
import { createConsoleSms } from '../src/sms/console.js';
import { createTwilioSms } from '../src/sms/twilio.js';

test('console provider logs the message instead of sending', async () => {
  const lines = [];
  await createConsoleSms((line) => lines.push(line)).send('+447700900123', 'Your code is 123456');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\+447700900123.*123456/);
});

test('createSmsProvider picks by name and rejects unknown or incomplete setups', () => {
  assert.equal(createSmsProvider({ provider: 'console' }).name, 'console');
  assert.throws(() => createSmsProvider({ provider: 'pigeon' }), /Unknown SMS_PROVIDER/);
  assert.throws(
    () =>
      createSmsProvider({
        provider: 'twilio',
        twilio: { accountSid: 'AC1', authToken: '', fromNumber: '' },
      }),
    /TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER/,
  );
});

test('twilio provider posts a form to the Messages endpoint with basic auth', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const sms = createTwilioSms(
    { accountSid: 'AC123', authToken: 'tok', fromNumber: '+15550001111' },
    fetchImpl,
  );
  await sms.send('+447700900123', 'hello');
  assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    calls[0].init.headers.Authorization,
    'Basic ' + Buffer.from('AC123:tok').toString('base64'),
  );
  assert.equal(calls[0].init.body.get('To'), '+447700900123');
  assert.equal(calls[0].init.body.get('From'), '+15550001111');
  assert.equal(calls[0].init.body.get('Body'), 'hello');
});

test('twilio provider throws on a non-2xx response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"code":20003}' });
  const sms = createTwilioSms({ accountSid: 'AC1', authToken: 't', fromNumber: '+1' }, fetchImpl);
  await assert.rejects(sms.send('+447700900123', 'x'), /Twilio responded 401/);
});
