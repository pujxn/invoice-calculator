import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Error with an HTTP status so routes can map failures directly.
export class AuthError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Issues and checks one-time codes. Codes are stored only as HMAC hashes, expire,
// lock after too many wrong tries, and can be resent at most once per cooldown.
export function createOtpService({ config, sms, now = Date.now, random = randomInt }) {
  const { otpTtlMs, otpLength, maxAttempts, resendSeconds, secret, limits } = config;
  const hmacKey = secret || randomBytes(32);
  const records = new Map(); // phone -> { hash, expiresAt, attempts, sentAt }
  const phoneRequests = new Map(); // phone -> timestamps of requests in the last hour
  const HOUR = 60 * 60 * 1000;

  const hashCode = (phone, code) =>
    createHmac('sha256', hmacKey).update(`${phone}:${code}`).digest();

  function generateCode() {
    return String(random(0, 10 ** otpLength)).padStart(otpLength, '0');
  }

  function checkPhoneLimits(phone, t) {
    const record = records.get(phone);
    if (record) {
      const wait = Math.ceil((record.sentAt + resendSeconds * 1000 - t) / 1000);
      if (wait > 0) {
        throw new AuthError(429, `Please wait ${wait} seconds before requesting another code.`, {
          retryAfterSeconds: wait,
        });
      }
    }
    const recent = (phoneRequests.get(phone) || []).filter((at) => t - at < HOUR);
    if (recent.length >= limits.requestsPerPhonePerHour) {
      const wait = Math.ceil((recent[0] + HOUR - t) / 1000);
      throw new AuthError(429, 'Too many code requests for this number. Try again later.', {
        retryAfterSeconds: wait,
      });
    }
    recent.push(t);
    phoneRequests.set(phone, recent);
  }

  return {
    async requestCode(phone) {
      const t = now();
      checkPhoneLimits(phone, t);
      const code = generateCode();
      records.set(phone, {
        hash: hashCode(phone, code),
        expiresAt: t + otpTtlMs,
        attempts: 0,
        sentAt: t,
      });
      try {
        await sms.send(phone, `Your Ledgerly code is ${code}. It expires in 5 minutes.`);
      } catch (err) {
        records.delete(phone); // let the user retry straight away
        console.error(`SMS send failed (${sms.name}): ${err.message}`);
        throw new AuthError(502, 'Could not send the code. Please try again.');
      }
      return { resendAfterSeconds: resendSeconds };
    },

    // Resolves if the code is right (and consumes it); throws AuthError otherwise.
    verifyCode(phone, code) {
      const t = now();
      const record = records.get(phone);
      if (!record || record.expiresAt <= t) {
        records.delete(phone);
        throw new AuthError(401, 'That code is invalid or has expired. Request a new one.');
      }
      if (record.attempts >= maxAttempts) {
        throw new AuthError(429, 'Too many wrong attempts. Request a new code.');
      }
      record.attempts += 1;
      const given = hashCode(phone, String(code));
      if (!timingSafeEqual(given, record.hash)) {
        const left = maxAttempts - record.attempts;
        throw new AuthError(
          401,
          left > 0
            ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`
            : 'Too many wrong attempts. Request a new code.',
        );
      }
      records.delete(phone); // single use
    },

    // Drops expired state; called on a timer by the app.
    sweep() {
      const t = now();
      for (const [phone, record] of records) if (record.expiresAt <= t) records.delete(phone);
      for (const [phone, times] of phoneRequests) {
        const recent = times.filter((at) => t - at < HOUR);
        if (recent.length) phoneRequests.set(phone, recent);
        else phoneRequests.delete(phone);
      }
    },
  };
}
