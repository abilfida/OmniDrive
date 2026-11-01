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
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(200);
    }
  });

  it('blocks requests over the limit with 429', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 2 });
    await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    const res = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many requests');
  });

  it('includes Retry-After header on 429', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 1 });
    await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    const res = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('tracks different IPs independently', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 1 });
    const res1 = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.1.1.1' } });
    const res2 = await app.request('/test', { headers: { 'CF-Connecting-IP': '2.2.2.2' } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('ignores X-Real-IP, so rotating it does not reset the limit', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 2 });
    await app.request('/test', { headers: { 'X-Real-IP': '1.1.1.1' } });
    await app.request('/test', { headers: { 'X-Real-IP': '2.2.2.2' } });
    const res = await app.request('/test', { headers: { 'X-Real-IP': '3.3.3.3' } });
    expect(res.status).toBe(429);
  });

  it('prefers the CLIENT_IP binding set by the Node server over request headers', async () => {
    const app = createApp({ windowMs: 60000, maxRequests: 1 });
    const spoofed = { headers: { 'CF-Connecting-IP': '9.9.9.9' } };
    await app.request('/test', spoofed, { CLIENT_IP: '10.0.0.1' });
    expect((await app.request('/test', spoofed, { CLIENT_IP: '10.0.0.1' })).status).toBe(429);
    expect((await app.request('/test', spoofed, { CLIENT_IP: '10.0.0.2' })).status).toBe(200);
  });

  it('keeps separate buckets for stacked limiters on the same path', async () => {
    const app = new Hono();
    app.use('/api/*', rateLimiter({ windowMs: 60000, maxRequests: 100 }));
    app.use('/api/login', rateLimiter({ windowMs: 60000, maxRequests: 3 }));
    app.post('/api/login', (c) => c.json({ ok: true }));
    const login = () => app.request('/api/login', { method: 'POST', headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await login()).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
