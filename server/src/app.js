import express from 'express';
import { createSmsProvider } from './sms/index.js';
import { createOtpService } from './auth/otpService.js';
import { createSessionStore } from './auth/sessions.js';
import { createRateLimiter } from './auth/rateLimiter.js';
import { createAuthRouter, createRequireAuth } from './auth/routes.js';

// `deps` lets tests inject a fake SMS provider and clock.
export function createApp(config, deps = {}) {
  const now = deps.now || Date.now;
  const sms = deps.sms || createSmsProvider(config.sms);
  const { auth } = config;

  const otp = createOtpService({ config: auth, sms, now, random: deps.random });
  const sessions = createSessionStore({ ttlMs: auth.sessionTtlMs, now });
  const ipRequestLimiter = createRateLimiter({
    limit: auth.limits.requestsPerIpPer15Min,
    windowMs: 15 * 60 * 1000,
    now,
  });
  const ipVerifyLimiter = createRateLimiter({
    limit: auth.limits.verifiesPerIpPer15Min,
    windowMs: 15 * 60 * 1000,
    now,
  });
  const requireAuth = createRequireAuth(sessions);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      providers: { sms: config.sms.provider, vision: config.vision.provider },
    });
  });

  app.use(
    '/api/auth',
    createAuthRouter({ otp, sessions, requireAuth, ipRequestLimiter, ipVerifyLimiter }),
  );

  // Malformed JSON and other errors get the same { error } shape as the rest of the API.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  // Housekeeping: drop expired codes, sessions and limiter entries (skipped in tests).
  if (!deps.now) {
    const timer = setInterval(() => {
      otp.sweep();
      sessions.sweep();
      ipRequestLimiter.sweep();
      ipVerifyLimiter.sweep();
    }, 60 * 1000);
    timer.unref();
  }

  app.locals.requireAuth = requireAuth; // for later routers (upload, extract, calculate)
  return app;
}
