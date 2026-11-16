import { createHash, randomBytes } from 'node:crypto';

// In-memory sessions. The raw token goes to the client; only its SHA-256 is kept,
// so a memory dump does not reveal usable tokens. Restarting signs everyone out.
export function createSessionStore({ ttlMs, now = Date.now }) {
  const sessions = new Map(); // tokenHash -> { phone, expiresAt }
  const hashToken = (token) => createHash('sha256').update(token).digest('hex');

  return {
    create(phone) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = now() + ttlMs;
      sessions.set(hashToken(token), { phone, expiresAt });
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    // Returns { phone, expiresAt } or null if unknown or expired.
    get(token) {
      if (typeof token !== 'string' || !token) return null;
      const key = hashToken(token);
      const session = sessions.get(key);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(key);
        return null;
      }
      return { phone: session.phone, expiresAt: new Date(session.expiresAt).toISOString() };
    },
    destroy(token) {
      if (typeof token === 'string') sessions.delete(hashToken(token));
    },
    sweep() {
      const t = now();
      for (const [key, session] of sessions) if (session.expiresAt <= t) sessions.delete(key);
    },
  };
}
