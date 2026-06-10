import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter, _resetStoreForTesting } from '../src/middleware/rate-limiter';

function createApp(opts: { windowMs: number; maxRequests: number }) {
  const app = new Hono();
  app.use('*', rateLimiter(opts));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimiter', () => {
  beforeEach(() => {
    _resetStoreForTesting();
  });

  it('allows requests under the limit', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 3 });
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/test', {
        headers: { 'X-Real-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(200);
    }
  });

  it('blocks requests over the limit with 429', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 2 });
    await app.request('/test', { headers: { 'X-Real-IP': '1.2.3.4' } });
    await app.request('/test', { headers: { 'X-Real-IP': '1.2.3.4' } });
    const res = await app.request('/test', { headers: { 'X-Real-IP': '1.2.3.4' } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many requests');
  });

  it('includes Retry-After header on 429', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 1 });
    await app.request('/test', { headers: { 'X-Real-IP': '1.2.3.4' } });
    const res = await app.request('/test', { headers: { 'X-Real-IP': '1.2.3.4' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('tracks different IPs independently', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 1 });
    const res1 = await app.request('/test', { headers: { 'X-Real-IP': '1.1.1.1' } });
    const res2 = await app.request('/test', { headers: { 'X-Real-IP': '2.2.2.2' } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
