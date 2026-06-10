import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyFn?: (c: any) => string;
}

export function rateLimiter(opts: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    cleanup(opts.windowMs);

    const key = opts.keyFn
      ? opts.keyFn(c)
      : c.req.header('CF-Connecting-IP') ??
        c.req.header('X-Real-IP') ??
        'unknown';

    const now = Date.now();
    const entry = store.get(key) ?? { timestamps: [] };

    entry.timestamps = entry.timestamps.filter((t) => now - t < opts.windowMs);

    if (entry.timestamps.length >= opts.maxRequests) {
      const retryAfter = Math.ceil(
        (entry.timestamps[0] + opts.windowMs - now) / 1000
      );
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }

    entry.timestamps.push(now);
    store.set(key, entry);

    return next();
  });
}

/** Only for testing — clears all rate limit state */
export function _resetStoreForTesting() {
  store.clear();
}
