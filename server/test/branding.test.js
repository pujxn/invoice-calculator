import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

test('the one-time-code SMS is branded Ledgerly and still carries a 6-digit code', async () => {
  const app = await startTestApp();
  try {
    const res = await app.call('POST', '/api/auth/request-otp', {
      body: { phone: '+447700900123' },
    });
    assert.equal(res.status, 200);
    const { body, code } = app.sent[0];
    assert.match(body, /^Your Ledgerly code is \d{6}\./);
    assert.doesNotMatch(body, /Invoice Calculator/);
    assert.match(code, /^\d{6}$/);
    assert.ok(body.length <= 160, 'fits in a single SMS');
  } finally {
    app.close();
  }
});
