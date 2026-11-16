// Fixed-window counter keyed by string. In memory, so it resets on restart.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map(); // key -> { count, resetAt }

  return {
    // Records one hit. Returns { allowed, retryAfterSeconds }.
    hit(key) {
      const t = now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(key, entry);
      }
      if (entry.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000) };
      }
      entry.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    // Drops expired entries so the map cannot grow forever.
    sweep() {
      const t = now();
      for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
    },
  };
}
