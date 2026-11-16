import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/auth/rateLimiter.js';

test('allows up to the limit, then refuses with the seconds until the window resets', () => {
  let t = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => t });
  assert.deepEqual(limiter.hit('a'), { allowed: true, retryAfterSeconds: 0 });
  t = 1000;
  assert.equal(limiter.hit('a').allowed, true);
  t = 4000;
  assert.deepEqual(limiter.hit('a'), { allowed: false, retryAfterSeconds: 6 });
});

test('refused hits do not extend the window', () => {
  let t = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => t });
  limiter.hit('a');
  t = 9000;
  assert.equal(limiter.hit('a').allowed, false);
  t = 10_000;
  assert.equal(limiter.hit('a').allowed, true);
});

test('keys are counted separately', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('b').allowed, true);
  assert.equal(limiter.hit('a').allowed, false);
});

test('sweep drops only expired entries', () => {
  let t = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
  limiter.hit('old');
  t = 900;
  limiter.hit('new');
  t = 1100;
  limiter.sweep();
  assert.equal(limiter.hit('old').allowed, true); // forgotten
  assert.equal(limiter.hit('new').allowed, false); // still counted
});
