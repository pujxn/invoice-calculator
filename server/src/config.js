import path from 'node:path';

// Central place for environment configuration. Providers (SMS, vision) read
// their own settings from here so nothing else touches process.env directly.
// Reads a positive whole number from the environment, else the fallback.
function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Reads a positive number (decimals allowed, e.g. 0.5), else the fallback.
function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env = process.env) {
  const anthropicKey = env.ANTHROPIC_API_KEY || '';
  return {
    port: Number(env.PORT) || 4000,
    auth: {
      // HMAC key for one-time codes. If unset, a random key is generated per
      // process (codes in flight do not survive a restart, which is fine).
      secret: env.AUTH_SECRET || '',
      otpTtlMs: 5 * 60 * 1000,
      otpLength: 6,
      maxAttempts: 5,
      resendSeconds: 30,
      sessionTtlMs: 12 * 60 * 60 * 1000,
      // Abuse limits that cap SMS cost and guessing.
      limits: {
        requestsPerPhonePerHour: 5,
        requestsPerIpPer15Min: positiveInt(env.AUTH_IP_REQUEST_LIMIT, 20),
        verifiesPerIpPer15Min: positiveInt(env.AUTH_IP_VERIFY_LIMIT, 40),
      },
    },
    sms: {
      provider: env.SMS_PROVIDER || 'console',
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID || '',
        authToken: env.TWILIO_AUTH_TOKEN || '',
        fromNumber: env.TWILIO_FROM_NUMBER || '',
      },
    },
    uploads: {
      // Where invoice pictures are kept. A relative path is relative to where the server starts.
      dir: env.UPLOAD_DIR || path.resolve(import.meta.dirname, '../uploads'),
      maxBytes: Math.floor(positiveNumber(env.UPLOAD_MAX_MB, 10) * 1024 * 1024),
      ttlMs: positiveNumber(env.UPLOAD_TTL_HOURS, 24) * 60 * 60 * 1000,
      maxPerUser: positiveInt(env.UPLOAD_MAX_PER_USER, 50),
    },
    vision: {
      provider: env.VISION_PROVIDER || (anthropicKey ? 'claude' : 'mock'),
      anthropicKey,
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    },
  };
}
