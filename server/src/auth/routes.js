import { Router } from 'express';
import { AuthError } from './otpService.js';
import { normalizePhone } from './phone.js';

export function bearerToken(req) {
  const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  return match ? match[1] : null;
}

// Middleware for any route that needs a signed-in user. Later steps reuse it.
export function createRequireAuth(sessions) {
  return (req, res, next) => {
    const token = bearerToken(req);
    const session = sessions.get(token);
    if (!session) return res.status(401).json({ error: 'Please sign in.' });
    req.session = { ...session, token };
    next();
  };
}

function limitByIp(limiter, message) {
  return (req, res, next) => {
    const result = limiter.hit(req.ip);
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({ error: message, retryAfterSeconds: result.retryAfterSeconds });
  };
}

// Wraps async handlers and turns AuthError into a JSON error response.
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (!(err instanceof AuthError)) return next(err);
    if (err.extra.retryAfterSeconds) res.set('Retry-After', String(err.extra.retryAfterSeconds));
    res.status(err.status).json({ error: err.message, ...err.extra });
  }
};

export function createAuthRouter({
  otp,
  sessions,
  requireAuth,
  ipRequestLimiter,
  ipVerifyLimiter,
}) {
  const router = Router();

  router.post(
    '/request-otp',
    limitByIp(ipRequestLimiter, 'Too many requests. Try again later.'),
    handle(async (req, res) => {
      const phone = normalizePhone(req.body?.phone);
      if (!phone) {
        throw new AuthError(
          400,
          'Enter a mobile number in international format, e.g. +447700900123.',
        );
      }
      res.json({ ok: true, ...(await otp.requestCode(phone)) });
    }),
  );

  router.post(
    '/verify-otp',
    limitByIp(ipVerifyLimiter, 'Too many attempts. Try again later.'),
    handle(async (req, res) => {
      const phone = normalizePhone(req.body?.phone);
      const code = req.body?.code;
      if (!phone) throw new AuthError(400, 'Enter a valid mobile number.');
      if (typeof code !== 'string' || !/^\d+$/.test(code.trim())) {
        throw new AuthError(400, 'Enter the numeric code from the SMS.');
      }
      otp.verifyCode(phone, code.trim());
      res.json(sessions.create(phone));
    }),
  );

  router.post('/logout', requireAuth, (req, res) => {
    sessions.destroy(req.session.token);
    res.json({ ok: true });
  });

  // Lets the web app check a stored token on page load.
  router.get('/me', requireAuth, (req, res) => {
    res.json({ phone: req.session.phone, expiresAt: req.session.expiresAt });
  });

  return router;
}
