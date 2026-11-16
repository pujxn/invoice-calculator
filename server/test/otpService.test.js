import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, createOtpService } from '../src/auth/otpService.js';
import { loadConfig } from '../src/config.js';

const PHONE = '+447700900123';

function setup({ random, sms } = {}) {
  const clock = { t: 0 };
  const sent = [];
  const service = createOtpService({
    config: loadConfig({ AUTH_SECRET: 's' }).auth,
    sms: sms || { name: 'fake', send: async (to, body) => sent.push({ to, body }) },
    now: () => clock.t,
    random,
  });
  return { service, clock, sent };
}

const codeIn = (message) => /(\d{6})/.exec(message)[1];

test('codes are zero padded to 6 digits', async () => {
  const { service, sent } = setup({ random: () => 7 });
  await service.requestCode(PHONE);
  assert.match(sent[0].body, /code is 000007\./);
  service.verifyCode(PHONE, '000007');
});

test('generates codes over the full 000000-999999 range', async () => {
  const seen = [];
  const { service } = setup({
    random: (min, max) => {
      seen.push([min, max]);
      return 0;
    },
  });
  await service.requestCode(PHONE);
  assert.deepEqual(seen[0], [0, 1_000_000]);
});

test('verifyCode throws AuthError 401 for a number that never requested a code', () => {
  const { service } = setup();
  assert.throws(
    () => service.verifyCode(PHONE, '123456'),
    (err) => err instanceof AuthError && err.status === 401,
  );
});

test('a newer code replaces the older one and resets the attempt count', async () => {
  const { service, clock, sent } = setup();
  await service.requestCode(PHONE);
  const first = codeIn(sent[0].body);
  const wrong = first === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.throws(() => service.verifyCode(PHONE, wrong));
  clock.t += 31_000;
  await service.requestCode(PHONE);
  const second = codeIn(sent[1].body);
  if (second !== first) assert.throws(() => service.verifyCode(PHONE, first)); // old code is dead
  // Attempts were reset by the new code, so the correct one is accepted.
  service.verifyCode(PHONE, second);
});

test('the 5th wrong try says to request a new code; the 6th is refused as locked (429)', async () => {
  const { service, sent } = setup();
  await service.requestCode(PHONE);
  const good = codeIn(sent[0].body);
  const wrong = good === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++)
    assert.throws(() => service.verifyCode(PHONE, wrong), /tr(y|ies) left/);
  assert.throws(() => service.verifyCode(PHONE, wrong), /Request a new code/);
  assert.throws(
    () => service.verifyCode(PHONE, good),
    (err) => err.status === 429,
  );
});

test('non-numeric or wrong-length guesses are simply wrong, not crashes', async () => {
  const { service } = setup();
  await service.requestCode(PHONE);
  for (const guess of ['', 'abcdef', '12345', '1234567', ' ']) {
    assert.throws(
      () => service.verifyCode(PHONE, guess),
      (err) => err instanceof AuthError && err.status === 401,
    );
  }
});

test('the SMS text states the code lifetime', async () => {
  const { service, sent } = setup();
  await service.requestCode(PHONE);
  assert.match(sent[0].body, /expires in 5 minutes/);
});

test('expired state is swept without affecting live codes', async () => {
  const { service, clock, sent } = setup();
  await service.requestCode('+14155552671');
  clock.t += 4 * 60 * 1000;
  await service.requestCode(PHONE);
  clock.t += 2 * 60 * 1000; // first code is now 6 min old, second is 2 min old
  service.sweep();
  assert.throws(() => service.verifyCode('+14155552671', codeIn(sent[0].body)), /expired/);
  service.verifyCode(PHONE, codeIn(sent[1].body));
});

test('a failed send leaves no code behind', async () => {
  const log = console.error;
  console.error = () => {};
  try {
    const { service } = setup({
      sms: {
        name: 'broken',
        send: async () => {
          throw new Error('down');
        },
      },
    });
    await assert.rejects(
      service.requestCode(PHONE),
      (err) => err instanceof AuthError && err.status === 502,
    );
    assert.throws(() => service.verifyCode(PHONE, '000000'), /invalid or has expired/);
  } finally {
    console.error = log;
  }
});
