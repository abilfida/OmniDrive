import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  timestamps: number[];
}

const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Every limiter keeps its own buckets and window. A shared store let stacked
// limiters (e.g. /api/* plus /api/auth/login) count each request twice and
// let a short window's cleanup trim a longer window's history.
const allStores = new Set<Map<string, RateLimitEntry>>();

// Address used to rate-limit a request. On Workers, CF-Connecting-IP is set by
// Cloudflare itself. The Node server passes the socket address (or the one its
// trusted proxy reported) as the CLIENT_IP binding. X-Real-IP is never trusted:
// any client can send it and get a fresh bucket on every request.
export function clientIp(c: any): string {
  return c.env?.CLIENT_IP ?? c.req.header('CF-Connecting-IP') ?? 'unknown';
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyFn?: (c: any) => string;
}

export function rateLimiter(opts: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();
  allStores.add(store);
  let lastCleanup = Date.now();

  return createMiddleware(async (c, next) => {
    const now = Date.now();
    if (now - lastCleanup >= CLEANUP_INTERVAL) {
      lastCleanup = now;
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => now - t < opts.windowMs);
        if (entry.timestamps.length === 0) store.delete(key);
      }
    }

    const key = opts.keyFn ? opts.keyFn(c) : clientIp(c);
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
  for (const store of allStores) store.clear();
}
