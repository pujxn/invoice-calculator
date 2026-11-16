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
    production: env.NODE_ENV === 'production',
    // How many proxies sit in front of the server (a load balancer, nginx). Needed so the per-IP
    // limits see the visitor's address and not the proxy's. Leave unset when there is none.
    trustProxy: positiveInt(env.TRUST_PROXY, 0),
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
      // How hard the model thinks (low, medium, high, xhigh, max); "none" leaves it to the API.
      effort: (env.ANTHROPIC_EFFORT || 'medium') === 'none' ? '' : env.ANTHROPIC_EFFORT || 'medium',
      timeoutMs: Math.round(positiveNumber(env.ANTHROPIC_TIMEOUT_SECONDS, 60) * 1000),
      // Set to "default" to let the API retry a declined request on another model.
      fallbacks: env.ANTHROPIC_FALLBACKS || '',
      // Reads one user may start per hour; each real read costs money.
      extractionsPerUserPerHour: positiveInt(env.EXTRACT_PER_USER_PER_HOUR, 30),
    },
  };
}

// Things that are fine on a laptop but wrong on a real server. Shown once at start-up.
export function configWarnings(config) {
  if (!config.production) return [];
  const warnings = [];
  if (config.sms.provider === 'console') {
    warnings.push(
      'SMS_PROVIDER=console prints every sign-in code to the log, so anyone who can read it can sign in. Use SMS_PROVIDER=twilio.',
    );
  }
  if (config.vision.provider === 'mock') {
    warnings.push(
      'VISION_PROVIDER=mock: invoices are not read, users are shown made-up demo amounts. Set ANTHROPIC_API_KEY.',
    );
  }
  if (!config.auth.secret) {
    warnings.push('AUTH_SECRET is not set: codes sent before a restart stop working.');
  }
  return warnings;
}
