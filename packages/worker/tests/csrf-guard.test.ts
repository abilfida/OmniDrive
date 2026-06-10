import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { csrfGuard } from '../src/middleware/csrf-guard';

function createApp(frontendUrl = 'https://app.example.com', workerUrl = 'https://api.example.com') {
  const app = new Hono<{ Bindings: { FRONTEND_URL: string; WORKER_URL: string } }>();
  app.use('*', csrfGuard);
  app.post('/api/test', (c) => c.json({ ok: true }));
  app.get('/api/test', (c) => c.json({ ok: true }));
  app.post('/api/auth/login', (c) => c.json({ ok: true }));
  app.post('/api/auth/register', (c) => c.json({ ok: true }));
  app.get('/api/auth/google/callback', (c) => c.json({ ok: true }));
  app.post('/api/shared/abc123/verify', (c) => c.json({ ok: true }));
  app.get('/api/shared/abc123/download', (c) => c.json({ ok: true }));
  app.post('/api/shared', (c) => c.json({ ok: true }));
  return { app, env: { FRONTEND_URL: frontendUrl, WORKER_URL: workerUrl } };
}

describe('csrfGuard', () => {
  it('allows GET requests without Origin header', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/test', { method: 'GET' }, env);
    expect(res.status).toBe(200);
  });

  it('allows POST with valid Origin header', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Origin': 'https://app.example.com', 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(200);
  });

  it('blocks POST with invalid Origin header', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Origin': 'https://evil.com', 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(403);
  });

  it('blocks POST with no Origin and no Referer', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(403);
  });

  it('allows POST with valid Referer (fallback)', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Referer': 'https://app.example.com/page', 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/login', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/register', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts POST /api/shared/:id/verify (public password check)', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/shared/abc123/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts GET /api/shared/:id/download (public download)', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/shared/abc123/download', { method: 'GET' }, env);
    expect(res.status).toBe(200);
  });

  it('does NOT exempt POST /api/shared (create — requires auth)', async () => {
    const { app, env } = createApp();
    const res = await app.request('/api/shared', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(403);
  });
});
