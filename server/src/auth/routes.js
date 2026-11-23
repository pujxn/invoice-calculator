import { Router } from 'express';
import { AuthError } from './otpService.js';
import { normalizePhone } from './phone.js';

export function bearerToken(req) {
  const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  return match ? match[1] : null;
}

const NOT_REGISTERED =
  'This number is not registered with Ledgerly. Ask your administrator to add it.';

// Middleware for any route that needs a signed-in user. The role comes from who the number belongs
// to right now (see roles/index.js), so a removed agent's open session stops working at once.
// Sets req.session = { phone, name, role, expiresAt, token }.
export function createRequireAuth(sessions, roles) {
  return (req, res, next) => {
    const token = bearerToken(req);
    const session = sessions.get(token);
    if (!session) return res.status(401).json({ error: 'Please sign in.' });
    const user = roles.lookup(session.phone);
    if (!user) {
      sessions.destroy(token);
      return res.status(401).json({ error: 'Please sign in.' });
    }
    req.session = { ...session, token, name: user.name, role: user.role };
    next();
  };
}

// A route only one role may use: signed in (401 if not), then that role (403 if not).
export function createRequireRole(requireAuth, role, message) {
  return [
    requireAuth,
    (req, res, next) => {
      if (req.session.role !== role) return res.status(403).json({ error: message });
      next();
    },
  ];
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
  roles,
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
      // Only numbers a superadmin has added (and the superadmins' own) can sign in. Saying so here,
      // before a text is sent, also keeps strangers from running up the SMS bill.
      if (!roles.lookup(phone)) throw new AuthError(403, NOT_REGISTERED);
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
      if (!roles.lookup(phone)) throw new AuthError(403, NOT_REGISTERED);
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
    const { phone, name, role, expiresAt } = req.session;
    res.json({ phone, name, role, expiresAt });
  });

  return router;
}
