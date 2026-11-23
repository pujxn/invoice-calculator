import express from 'express';
import { createSmsProvider } from './sms/index.js';
import { createOtpService } from './auth/otpService.js';
import { createSessionStore } from './auth/sessions.js';
import { createRateLimiter } from './auth/rateLimiter.js';
import { createUploadStore } from './invoices/store.js';
import { createInvoiceRouter } from './invoices/routes.js';
import { createCalculateRouter } from './calculate/routes.js';
import { createExtractor, createVisionMethods } from './extraction/index.js';
import { createAuthRouter, createRequireAuth } from './auth/routes.js';
import { describeError, secretsFrom } from './log.js';
import { createCors } from './cors.js';

// `deps` lets tests inject a fake SMS provider and clock.
export function createApp(config, deps = {}) {
  const now = deps.now || Date.now;
  const sms = deps.sms || createSmsProvider(config.sms);
  const { auth } = config;
  const secrets = secretsFrom(config);

  const otp = createOtpService({ config: auth, sms, now, random: deps.random, secrets });
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

  // `deps.vision` (one provider) or `deps.visionMethods` (several) and `deps.prepare` let tests inject
  // fake vision providers and a fake image step.
  // One extractor per reading method that works on this server; the person picks one per reading.
  const vision = createVisionMethods(config.vision, {
    provider: deps.vision,
    methods: deps.visionMethods,
  });
  const extractors = Object.fromEntries(
    vision.methods
      .filter((m) => m.available)
      .map((m) => [
        m.id,
        createExtractor({
          provider: m.provider,
          ...(deps.prepare ? { prepare: deps.prepare } : {}),
        }),
      ]),
  );
  const readingMethods = {
    default: vision.default,
    methods: vision.methods.map(({ id, label, available, reason }) => ({
      id,
      label,
      available,
      ...(reason ? { reason } : {}),
    })),
  };
  const extractLimiter = createRateLimiter({
    limit: config.vision.extractionsPerUserPerHour,
    windowMs: 60 * 60 * 1000,
    now,
  });
  // Free readings (local OCR, demo values) get a much higher limit, so a batch of dozens of
  // invoices can be read. Only readings that cost money (AI) use the small one above.
  const freeExtractLimiter = createRateLimiter({
    limit: config.vision.freeReadingsPerUserPerHour,
    windowMs: 60 * 60 * 1000,
    now,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(createCors(config.cors));
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // Every answer is private to one user, so nothing is cached, and the browser is told not to
  // guess types, embed the API in a frame or send a referrer.
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      providers: { sms: config.sms.provider, vision: vision.default },
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
      extractors,
      readingMethods,
      extractLimiter,
      freeExtractLimiter,
      secrets,
    }),
  );

  // An unknown /api address answers in JSON like everything else, not with an HTML page.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Malformed JSON and other errors get the same { error } shape as the rest of the API.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That request is too large.' });
    }
    console.error(`Unhandled error: ${describeError(err, secrets)}`);
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
      freeExtractLimiter.sweep();
    }, 60 * 1000);
    timer.unref();
    // Delete invoice pictures older than UPLOAD_TTL_HOURS.
    const sweepUploads = () =>
      uploads.sweep().catch((err) => console.error(`upload sweep: ${describeError(err, secrets)}`));
    sweepUploads();
    const uploadTimer = setInterval(sweepUploads, 10 * 60 * 1000);
    uploadTimer.unref();
  }

  app.locals.requireAuth = requireAuth; // for later routers (extract, calculate)
  // Stops the local OCR engine (a background thread) so a test or shutdown can exit cleanly.
  app.locals.close = () => Promise.all(vision.methods.map((m) => m.provider?.close?.()));
  return app;
}
