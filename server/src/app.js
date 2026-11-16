import express from 'express';
import { createSmsProvider } from './sms/index.js';
import { createOtpService } from './auth/otpService.js';
import { createSessionStore } from './auth/sessions.js';
import { createRateLimiter } from './auth/rateLimiter.js';
import { createUploadStore } from './invoices/store.js';
import { createInvoiceRouter } from './invoices/routes.js';
import { createCalculateRouter } from './calculate/routes.js';
import { createExtractor, createVisionProvider } from './extraction/index.js';
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
  const uploads = createUploadStore({
    dir: config.uploads.dir,
    ttlMs: config.uploads.ttlMs,
    maxPerUser: config.uploads.maxPerUser,
  });

  // `deps.vision` and `deps.prepare` let tests inject a fake vision provider and image step.
  const extractor = createExtractor({
    provider: deps.vision || createVisionProvider(config.vision),
    ...(deps.prepare ? { prepare: deps.prepare } : {}),
  });
  const extractLimiter = createRateLimiter({
    limit: config.vision.extractionsPerUserPerHour,
    windowMs: 60 * 60 * 1000,
    now,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      providers: { sms: config.sms.provider, vision: extractor.provider },
    });
  });

  app.use(
    '/api/auth',
    createAuthRouter({ otp, sessions, requireAuth, ipRequestLimiter, ipVerifyLimiter }),
  );

  app.use('/api/invoices/calculate', createCalculateRouter({ requireAuth }));

  app.use(
    '/api/invoices',
    createInvoiceRouter({
      store: uploads,
      requireAuth,
      maxBytes: config.uploads.maxBytes,
      extractor,
      extractLimiter,
    }),
  );

  // Malformed JSON and other errors get the same { error } shape as the rest of the API.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That request is too large.' });
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
      extractLimiter.sweep();
    }, 60 * 1000);
    timer.unref();
    // Delete invoice pictures older than UPLOAD_TTL_HOURS.
    const sweepUploads = () => uploads.sweep().catch((err) => console.error('upload sweep', err));
    sweepUploads();
    const uploadTimer = setInterval(sweepUploads, 10 * 60 * 1000);
    uploadTimer.unref();
  }

  app.locals.requireAuth = requireAuth; // for later routers (extract, calculate)
  return app;
}
