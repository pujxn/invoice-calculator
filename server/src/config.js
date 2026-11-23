import path from 'node:path';
import { normalizePhone } from './auth/phone.js';

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

// What the native apps send as their origin (see cors.js). Android uses https://localhost because
// capacitor.config.ts sets androidScheme to https; the http form is kept for older installs.
export const NATIVE_APP_ORIGINS = [
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
];

// A comma-separated list of origins, with surrounding spaces and a trailing slash ignored.
function originList(value) {
  return String(value || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// A comma-separated list of mobile numbers, each normalised to E.164. Entries that are not valid
// numbers are returned in `invalid` so start-up can say so instead of silently ignoring them.
function phoneList(value) {
  const phones = [];
  const invalid = [];
  for (const item of String(value || '').split(',')) {
    if (!item.trim()) continue;
    const phone = normalizePhone(item);
    if (phone) phones.push(phone);
    else invalid.push(item.trim());
  }
  return { phones: [...new Set(phones)], invalid };
}

// The number a local demo signs in as when SUPERADMIN_PHONES is not set. Used only with the
// console SMS provider (codes in the server log), never with real texts or in production.
export const DEMO_SUPERADMIN = '+919999900000';

export function loadConfig(env = process.env) {
  const anthropicKey = env.ANTHROPIC_API_KEY || '';
  const smsProvider = env.SMS_PROVIDER || 'console';
  const production = env.NODE_ENV === 'production';
  const listed = phoneList(env.SUPERADMIN_PHONES);
  const useDemoSuperadmin =
    !listed.phones.length && !listed.invalid.length && !production && smsProvider === 'console';
  return {
    port: Number(env.PORT) || 4000,
    production,
    // How many proxies sit in front of the server (a load balancer, nginx). Needed so the per-IP
    // limits see the visitor's address and not the proxy's. Leave unset when there is none.
    trustProxy: positiveInt(env.TRUST_PROXY, 0),
    cors: {
      // Origins allowed to call the API from a browser on another host: the mobile apps, plus
      // anything listed in CORS_ORIGINS. "*" is not accepted on purpose.
      origins: [...new Set([...NATIVE_APP_ORIGINS, ...originList(env.CORS_ORIGINS)])].filter(
        (o) => o !== '*',
      ),
    },
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
    roles: {
      // Numbers that sign in as superadmin: they add and remove agents and see every agent's list.
      // Everyone else needs to be added as an agent first.
      superadmins: useDemoSuperadmin ? [DEMO_SUPERADMIN] : listed.phones,
      demoSuperadmin: useDemoSuperadmin,
      invalid: listed.invalid,
    },
    agents: {
      // The file the agents a superadmin adds are kept in (a relative path is relative to where
      // the server starts). "memory" keeps them only until the server stops.
      file:
        env.AGENTS_FILE === 'memory'
          ? null
          : env.AGENTS_FILE || path.resolve(import.meta.dirname, '../data/agents.json'),
    },
    sms: {
      provider: smsProvider,
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
    history: {
      // Where saved invoice history is kept (one JSON file). A relative path is relative to where
      // the server starts. Set it to "memory" to keep history only until the server stops.
      file:
        env.HISTORY_FILE === 'memory'
          ? null
          : env.HISTORY_FILE || path.resolve(import.meta.dirname, '../data/history.json'),
    },
    vision: {
      // How invoices are read when the user has not chosen: "claude" (AI, needs a key), "ocr"
      // (free, runs on this server) or "mock" (made-up demo numbers, used by the automated tests).
      // With no setting, a key means AI and no key means free OCR.
      provider: env.VISION_PROVIDER || (anthropicKey ? 'claude' : 'ocr'),
      ocr: {
        // Give up on one local reading after this long (the first reading also starts the engine).
        timeoutMs: Math.round(positiveNumber(env.OCR_TIMEOUT_SECONDS, 45) * 1000),
        // When the free OCR is not sure, let the AI read the picture instead (needs a key).
        fallbackToClaude: /^(1|true|yes|on)$/i.test(env.OCR_FALLBACK_TO_CLAUDE || ''),
      },
      anthropicKey,
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      // How hard the model thinks (low, medium, high, xhigh, max); "none" leaves it to the API.
      effort: (env.ANTHROPIC_EFFORT || 'medium') === 'none' ? '' : env.ANTHROPIC_EFFORT || 'medium',
      timeoutMs: Math.round(positiveNumber(env.ANTHROPIC_TIMEOUT_SECONDS, 60) * 1000),
      // Set to "default" to let the API retry a declined request on another model.
      fallbacks: env.ANTHROPIC_FALLBACKS || '',
      // Reads one user may start per hour; each real read costs money.
      extractionsPerUserPerHour: positiveInt(env.EXTRACT_PER_USER_PER_HOUR, 30),
      // Free readings (local OCR, demo values) cost nothing, so a whole batch of invoices can be
      // read; this only stops one user from flooding the server.
      freeReadingsPerUserPerHour: positiveInt(env.FREE_READINGS_PER_USER_PER_HOUR, 600),
    },
  };
}

// Things that are fine on a laptop but wrong on a real server. Shown once at start-up.
export function configWarnings(config) {
  const warnings = [];
  if (config.roles.invalid.length) {
    warnings.push(
      `SUPERADMIN_PHONES has numbers that are not valid (${config.roles.invalid.join(', ')}); use international format such as +919876543210.`,
    );
  }
  if (!config.production) return warnings;
  if (config.sms.provider === 'console') {
    warnings.push(
      'SMS_PROVIDER=console prints every sign-in code to the log, so anyone who can read it can sign in. Use SMS_PROVIDER=twilio.',
    );
  }
  if (config.vision.provider === 'mock') {
    warnings.push(
      'VISION_PROVIDER=mock: invoices are not read, users are shown made-up demo amounts. Use VISION_PROVIDER=ocr or set ANTHROPIC_API_KEY.',
    );
  }
  if (config.vision.ocr.fallbackToClaude && !config.vision.anthropicKey) {
    warnings.push(
      'OCR_FALLBACK_TO_CLAUDE is on but ANTHROPIC_API_KEY is not set, so it does nothing.',
    );
  }
  if (!config.auth.secret) {
    warnings.push('AUTH_SECRET is not set: codes sent before a restart stop working.');
  }
  if (!config.roles.superadmins.length) {
    warnings.push(
      'SUPERADMIN_PHONES is not set: nobody can sign in as superadmin, so no agents can be added.',
    );
  }
  if (!config.agents.file) {
    warnings.push('AGENTS_FILE=memory: the agents are lost when the server stops.');
  }
  if (!config.history.file) {
    warnings.push('HISTORY_FILE=memory: saved invoices are lost when the server stops.');
  }
  return warnings;
}
