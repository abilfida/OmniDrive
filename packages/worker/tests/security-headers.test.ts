import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from '../src/middleware/security-headers';

describe('securityHeaders', () => {
  it('sets all required security headers', async () => {
    const app = new Hono();
    app.use('*', securityHeaders);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });
});
