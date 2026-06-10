# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all CRITICAL and HIGH security vulnerabilities identified in the OmniDrive security audit, plus related MEDIUM fixes.

**Architecture:** Composable Hono middleware layer + isolated service utilities. Each security fix is a self-contained module following existing codebase patterns. New middleware slots into the existing `app.use()` chain in `src/index.ts`.

**Tech Stack:** TypeScript, Hono 4.7, Cloudflare Workers (D1/KV), Web Crypto API, Vitest

**Spec:** [`docs/superpowers/specs/2026-06-10-security-hardening-design.md`](file:///home/bilfid/projects/omnidrive/docs/superpowers/specs/2026-06-10-security-hardening-design.md)

---

## File Map

### New Files (in `packages/worker/`)

| File | Responsibility |
|------|----------------|
| `src/lib/validation.ts` | Password policy + webhook URL validation |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for OAuth token storage |
| `src/lib/pkce.ts` | PKCE S256 code verifier/challenge generation |
| `src/middleware/csrf-guard.ts` | CSRF protection via Origin/Referer validation |
| `src/middleware/rate-limiter.ts` | In-memory sliding window rate limiter |
| `src/middleware/security-headers.ts` | Security response headers (X-Frame-Options, CSP, etc.) |
| `tests/validation.test.ts` | Tests for password + webhook validation |
| `tests/crypto.test.ts` | Tests for encrypt/decrypt |
| `tests/pkce.test.ts` | Tests for PKCE generation |
| `tests/csrf-guard.test.ts` | Tests for CSRF middleware |
| `tests/rate-limiter.test.ts` | Tests for rate limiter |
| `tests/security-headers.test.ts` | Tests for security headers middleware |

### Modified Files (in `packages/worker/`)

| File | Changes |
|------|---------|
| `src/types/env.ts` | Add `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` to `Env` interface; add `createdAt` to `SessionData` |
| `src/middleware/auth-guard.ts` | Add absolute session lifetime (30-day cap) |
| `src/middleware/cors.ts` | Tighten localhost matching |
| `src/routes/shared.ts` | IDOR ownership checks, JWT_SECRET, longer IDs, webhook validation, error sanitization |
| `src/routes/auth.ts` | Password validation, session createdAt, PKCE, token encryption |
| `src/routes/drives.ts` | Token encryption on write, PKCE |
| `src/routes/workspaces.ts` | Role escalation prevention |
| `src/services/google-drive.ts` | Token decryption on read, unified KV prefix |
| `src/index.ts` | Register new middleware chain |
| `.dev.vars.example` | Document new secrets |
| `wrangler.example.toml` | Document new secrets |

### Modified Files (project root)

| File | Changes |
|------|---------|
| `nginx-unified.conf` | Security headers, `server_tokens off` |
| `README.md` | Document new environment variables |

---

### Task 1: Validation Utilities (Password Policy + Webhook SSRF Prevention)

**Files:**
- Create: `packages/worker/src/lib/validation.ts`
- Test: `packages/worker/tests/validation.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validatePassword, validateWebhookUrl } from '../src/lib/validation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Abc1')).toBe('Password must be at least 8 characters');
  });

  it('rejects passwords without uppercase letter', () => {
    expect(validatePassword('abcdefg1')).toBe('Password must contain an uppercase letter');
  });

  it('rejects passwords without lowercase letter', () => {
    expect(validatePassword('ABCDEFG1')).toBe('Password must contain a lowercase letter');
  });

  it('rejects passwords without number', () => {
    expect(validatePassword('Abcdefgh')).toBe('Password must contain a number');
  });

  it('accepts valid passwords', () => {
    expect(validatePassword('Abcdefg1')).toBeNull();
    expect(validatePassword('StrongP@ss1')).toBeNull();
  });
});

describe('validateWebhookUrl', () => {
  it('rejects non-HTTPS URLs', () => {
    expect(validateWebhookUrl('http://example.com/hook')).toBe('Webhook URL must use HTTPS');
  });

  it('rejects localhost', () => {
    expect(validateWebhookUrl('https://localhost/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects 127.0.0.1', () => {
    expect(validateWebhookUrl('https://127.0.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects cloud metadata IP', () => {
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 10.x.x.x range', () => {
    expect(validateWebhookUrl('https://10.0.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 192.168.x.x range', () => {
    expect(validateWebhookUrl('https://192.168.1.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 172.16-31.x.x range', () => {
    expect(validateWebhookUrl('https://172.16.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
    expect(validateWebhookUrl('https://172.31.255.255/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('allows valid 172.x addresses outside private range', () => {
    expect(validateWebhookUrl('https://172.32.0.1/hook')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(validateWebhookUrl('not-a-url')).toBe('Invalid webhook URL');
  });

  it('accepts valid public HTTPS URLs', () => {
    expect(validateWebhookUrl('https://hooks.slack.com/services/xxx')).toBeNull();
    expect(validateWebhookUrl('https://example.com/webhook')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/validation.test.ts`
Expected: FAIL — module `../src/lib/validation` not found

- [ ] **Step 3: Write implementation**

```ts
// src/lib/validation.ts
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

export function validateWebhookUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid webhook URL';
  }

  if (parsed.protocol !== 'https:') return 'Webhook URL must use HTTPS';

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') {
    return 'Webhook URL must not point to private/internal addresses';
  }

  // Block cloud metadata
  if (hostname === '169.254.169.254') {
    return 'Webhook URL must not point to private/internal addresses';
  }

  // Block private IP ranges
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    // 10.0.0.0/8
    if (a === 10) return 'Webhook URL must not point to private/internal addresses';
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return 'Webhook URL must not point to private/internal addresses';
    // 192.168.0.0/16
    if (a === 192 && b === 168) return 'Webhook URL must not point to private/internal addresses';
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/validation.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/lib/validation.ts tests/validation.test.ts
git commit -m "feat(security): add password validation and webhook URL SSRF prevention"
```

---

### Task 2: AES-256-GCM Crypto Module

**Files:**
- Create: `packages/worker/src/lib/crypto.ts`
- Test: `packages/worker/tests/crypto.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, decryptOrPassthrough } from '../src/lib/crypto';

const TEST_KEY = 'a]V3$kP9mN7wQ2xR8jF5tL0yB6cH4dG'; // exactly 32 chars

describe('encrypt/decrypt', () => {
  it('round-trips a simple string', async () => {
    const plaintext = 'hello world';
    const encrypted = await encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips JSON token data', async () => {
    const tokens = JSON.stringify({ accessToken: 'ya29.abc', refreshToken: '1//xyz', expiresAt: 1234567890 });
    const encrypted = await encrypt(tokens, TEST_KEY);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(tokens);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const plaintext = 'same input';
    const a = await encrypt(plaintext, TEST_KEY);
    const b = await encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with wrong key', async () => {
    const encrypted = await encrypt('secret', TEST_KEY);
    const wrongKey = 'b]W4$lQ0nO8xR3yS9kG6uM1zA7dI5eH';
    await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
  });
});

describe('decryptOrPassthrough', () => {
  it('decrypts encrypted values', async () => {
    const encrypted = await encrypt('token-data', TEST_KEY);
    const result = await decryptOrPassthrough(encrypted, TEST_KEY);
    expect(result).toBe('token-data');
  });

  it('passes through plain text (legacy unencrypted tokens)', async () => {
    const plainJson = '{"accessToken":"ya29.abc","refreshToken":"1//xyz"}';
    const result = await decryptOrPassthrough(plainJson, TEST_KEY);
    expect(result).toBe(plainJson);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/crypto.test.ts`
Expected: FAIL — module `../src/lib/crypto` not found

- [ ] **Step 3: Write implementation**

```ts
// src/lib/crypto.ts
const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Format: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

export async function decryptOrPassthrough(value: string, secret: string): Promise<string> {
  try {
    return await decrypt(value, secret);
  } catch {
    // Value is not encrypted (legacy plain-text token) — return as-is
    return value;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/crypto.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/lib/crypto.ts tests/crypto.test.ts
git commit -m "feat(security): add AES-256-GCM crypto module for token encryption"
```

---

### Task 3: PKCE Module

**Files:**
- Create: `packages/worker/src/lib/pkce.ts`
- Test: `packages/worker/tests/pkce.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/pkce.test.ts
import { describe, it, expect } from 'vitest';
import { generatePKCE } from '../src/lib/pkce';

describe('generatePKCE', () => {
  it('returns codeVerifier and codeChallenge', async () => {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();
    expect(typeof codeVerifier).toBe('string');
    expect(typeof codeChallenge).toBe('string');
  });

  it('codeVerifier is URL-safe (no +, /, =)', async () => {
    const { codeVerifier } = await generatePKCE();
    expect(codeVerifier).not.toMatch(/[+/=]/);
  });

  it('codeChallenge is URL-safe (no +, /, =)', async () => {
    const { codeChallenge } = await generatePKCE();
    expect(codeChallenge).not.toMatch(/[+/=]/);
  });

  it('codeVerifier has sufficient length (>= 43 chars per RFC 7636)', async () => {
    const { codeVerifier } = await generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it('generates different values each time', async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/pkce.test.ts`
Expected: FAIL — module `../src/lib/pkce` not found

- [ ] **Step 3: Write implementation**

```ts
// src/lib/pkce.ts
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/pkce.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/lib/pkce.ts tests/pkce.test.ts
git commit -m "feat(security): add PKCE S256 module for OAuth flow"
```

---

### Task 4: CSRF Guard Middleware

**Files:**
- Create: `packages/worker/src/middleware/csrf-guard.ts`
- Test: `packages/worker/tests/csrf-guard.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/csrf-guard.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/csrf-guard.test.ts`
Expected: FAIL — module `../src/middleware/csrf-guard` not found

- [ ] **Step 3: Write implementation**

```ts
// src/middleware/csrf-guard.ts
import { createMiddleware } from 'hono/factory';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const CSRF_EXEMPT_PATHS = [
  '/api/auth/google/callback',
  '/api/auth/login',
  '/api/auth/register',
];

function isPublicSharedEndpoint(method: string, path: string): boolean {
  const sharedMatch = path.match(/^\/api\/shared\/[^/]+/);
  if (!sharedMatch) return false;
  if (method === 'GET') return true;
  if (method === 'POST' && path.endsWith('/verify')) return true;
  return false;
}

export const csrfGuard = createMiddleware<{
  Bindings: { FRONTEND_URL: string; WORKER_URL: string };
}>(async (c, next) => {
  if (SAFE_METHODS.includes(c.req.method)) {
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (CSRF_EXEMPT_PATHS.some((p) => path.startsWith(p))) {
    return next();
  }
  if (isPublicSharedEndpoint(c.req.method, path)) {
    return next();
  }

  const allowedOrigins = [c.env.FRONTEND_URL, c.env.WORKER_URL].filter(Boolean);

  const origin = c.req.header('Origin');
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return c.json({ error: 'CSRF validation failed' }, 403);
    }
    return next();
  }

  const referer = c.req.header('Referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        return c.json({ error: 'CSRF validation failed' }, 403);
      }
      return next();
    } catch {
      return c.json({ error: 'CSRF validation failed' }, 403);
    }
  }

  return c.json({ error: 'CSRF validation failed' }, 403);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/csrf-guard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/middleware/csrf-guard.ts tests/csrf-guard.test.ts
git commit -m "feat(security): add CSRF guard middleware with Origin/Referer validation"
```

---

### Task 5: Rate Limiter Middleware

**Files:**
- Create: `packages/worker/src/middleware/rate-limiter.ts`
- Test: `packages/worker/tests/rate-limiter.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/rate-limiter.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/rate-limiter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/middleware/rate-limiter.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/rate-limiter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/middleware/rate-limiter.ts tests/rate-limiter.test.ts
git commit -m "feat(security): add in-memory sliding window rate limiter middleware"
```

---

### Task 6: Security Headers Middleware + Nginx Config

**Files:**
- Create: `packages/worker/src/middleware/security-headers.ts`
- Test: `packages/worker/tests/security-headers.test.ts`
- Modify: `nginx-unified.conf`

- [ ] **Step 1: Write failing tests**

```ts
// tests/security-headers.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/worker && npx vitest run tests/security-headers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/middleware/security-headers.ts
import { createMiddleware } from 'hono/factory';

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/worker && npx vitest run tests/security-headers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update nginx-unified.conf**

Replace the entire file `nginx-unified.conf` (project root) with:

```nginx
server {
    listen 80;
    server_name _;

    # Hide server version
    server_tokens off;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://*.googleusercontent.com data:; connect-src 'self'" always;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/json application/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/worker/src/middleware/security-headers.ts packages/worker/tests/security-headers.test.ts nginx-unified.conf
git commit -m "feat(security): add security headers middleware and harden nginx config"
```

---

### Task 7: Update Env Types + Config Templates

**Files:**
- Modify: `packages/worker/src/types/env.ts:1-8`
- Modify: `packages/worker/.dev.vars.example`
- Modify: `packages/worker/wrangler.example.toml`

- [ ] **Step 1: Add new secrets to Env interface**

In `packages/worker/src/types/env.ts`, replace lines 1-8:

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  WORKER_URL: string;
  JWT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}
```

- [ ] **Step 2: Add createdAt to SessionData**

In the same file, replace lines 10-17:

```ts
export interface SessionData {
  userId: string;
  username: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'super_admin' | 'member';
  createdAt: number;
}
```

- [ ] **Step 3: Update .dev.vars.example**

Replace the contents of `packages/worker/.dev.vars.example`:

```
# Omnidrive Worker Secrets
# Copy this file to .dev.vars and fill in your values:
#   cp .dev.vars.example .dev.vars
#
# Get these from Google Cloud Console > APIs & Services > Credentials
# Create an OAuth 2.0 Client ID (Web application type)

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Security secrets — generate with: node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
JWT_SECRET=your-random-32-char-jwt-secret-here
TOKEN_ENCRYPTION_KEY=your-random-32-char-encryption-key
```

- [ ] **Step 4: Update wrangler.example.toml**

Add a comment block after the `[vars]` section in `packages/worker/wrangler.example.toml` after line 25:

```toml
# Security secrets — set via:
#   npx wrangler secret put JWT_SECRET
#   npx wrangler secret put TOKEN_ENCRYPTION_KEY
# Generate with: node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
```

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/types/env.ts .dev.vars.example wrangler.example.toml
git commit -m "feat(security): add JWT_SECRET and TOKEN_ENCRYPTION_KEY to env types and config templates"
```

---

### Task 8: Harden Auth Routes (Password Validation, Session createdAt, PKCE)

**Files:**
- Modify: `packages/worker/src/routes/auth.ts`
- Modify: `packages/worker/src/middleware/auth-guard.ts`

- [ ] **Step 1: Add password validation to register handler**

In `packages/worker/src/routes/auth.ts`, add import at line 7 (after the `generateId` import):

```ts
import { validatePassword } from '../lib/validation';
```

Then in the register handler (after line 19 `if (!username || !password) throw ...`), add:

```ts
  const passwordError = validatePassword(password);
  if (passwordError) throw new AppError(400, passwordError);
```

- [ ] **Step 2: Add createdAt to session data in register handler**

In `packages/worker/src/routes/auth.ts` line 47, replace the `sessionData` construction:

```ts
  const sessionData: SessionData = { userId: id, username, email: email || null, name: username, avatarUrl: null, role: isSuperAdmin ? 'super_admin' : 'member', createdAt: Date.now() };
```

- [ ] **Step 3: Add createdAt to session data in login handler**

In `packages/worker/src/routes/auth.ts` line 65, replace the `sessionData` construction:

```ts
  const sessionData: SessionData = { userId: user.id, username: user.username, email: user.email, name: user.name, avatarUrl: user.avatar_url, role: user.is_super_admin ? 'super_admin' : 'member', createdAt: Date.now() };
```

- [ ] **Step 4: Add PKCE to OAuth authorization URL**

In `packages/worker/src/routes/auth.ts`, add import at line 8 (after `authGuard` import):

```ts
import { generatePKCE } from '../lib/pkce';
```

Then replace the `authRouter.get('/google', ...)` handler (lines 77-95):

```ts
authRouter.get('/google', async (c) => {
  const env = c.env;
  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const scope = 'openid email profile https://www.googleapis.com/auth/drive';

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'consent');

  const state = crypto.randomUUID();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  // Store state + PKCE verifier in KV (10-min TTL)
  await env.KV.put(`oauth_state:${state}`, JSON.stringify({ codeVerifier }), { expirationTtl: 600 });
  setCookie(c, 'oauth_state', state, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 5 });

  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return c.redirect(authUrl.toString());
});
```

- [ ] **Step 5: Update callback to use PKCE + encrypt tokens**

Add import at top of `packages/worker/src/routes/auth.ts`:

```ts
import { encrypt } from '../lib/crypto';
```

Then replace the callback handler (lines 97-137):

```ts
authRouter.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) throw new AppError(400, 'Authorization code missing');

  const state = c.req.query('state');
  const savedState = getCookie(c, 'oauth_state');
  if (!state || state !== savedState) {
    throw new AppError(400, 'Invalid state parameter');
  }
  deleteCookie(c, 'oauth_state', { path: '/' });

  // Retrieve PKCE verifier from KV
  const stateDataJson = await c.env.KV.get(`oauth_state:${state}`);
  if (!stateDataJson) throw new AppError(400, 'OAuth state expired');
  const stateData = JSON.parse(stateDataJson);
  await c.env.KV.delete(`oauth_state:${state}`);

  const env = c.env;
  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const authService = new AuthService(env);

  const tokens = await authService.exchangeCodeForTokens(code, redirectUri, stateData.codeVerifier);
  const googleUser = await authService.fetchUserInfo(tokens.accessToken);

  const targetUserId = c.get('userId');
  const db = env.DB;

  await db.prepare('UPDATE users SET google_id = ?, email = COALESCE(email, ?), name = COALESCE(name, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
    .bind(googleUser.id, googleUser.email, googleUser.name, googleUser.picture, targetUserId).run();

  let drive = await db.prepare('SELECT id FROM drive_accounts WHERE google_account_id = ? AND user_id = ?').bind(googleUser.id, targetUserId).first<{ id: string }>();
  if (!drive) {
    const driveId = generateId();
    const res = await db.prepare('SELECT COUNT(*) as count FROM drive_accounts WHERE user_id = ?').bind(targetUserId).first<{ count: number }>();
    const isPrimary = (res && res.count === 0) ? 1 : 0;

    await db.prepare(
      'INSERT INTO drive_accounts (id, user_id, google_account_id, email, name, type, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(driveId, targetUserId, googleUser.id, googleUser.email, googleUser.name, 'oauth', isPrimary).run();
    drive = { id: driveId };
  }

  // Encrypt tokens before storing
  const encryptedTokens = await encrypt(JSON.stringify(tokens), env.TOKEN_ENCRYPTION_KEY);
  await env.KV.put(`tokens:${drive.id}`, encryptedTokens);

  return c.redirect(`${env.FRONTEND_URL}/`);
});
```

**Note:** The `AuthService.exchangeCodeForTokens` needs to accept the optional `codeVerifier` parameter. Check if it already does; if not, add it. The method should include `code_verifier` in the token exchange POST body when provided.

- [ ] **Step 6: Update auth-guard.ts with absolute session lifetime**

Replace the entire `packages/worker/src/middleware/auth-guard.ts`:

```ts
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppContext, SessionData } from '../types/env';
import { AppError } from './error-handler';

const MAX_SESSION_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days absolute max

export const authGuard = createMiddleware<AppContext>(async (c, next) => {
  const cookie = getCookie(c, 'omnidrive_sid');
  if (!cookie) {
    throw new AppError(401, 'Not authenticated');
  }

  const sessionJson = await c.env.KV.get(`session:${cookie}`);
  if (!sessionJson) {
    throw new AppError(401, 'Session expired');
  }

  const session: SessionData = JSON.parse(sessionJson);

  // Enforce absolute session lifetime
  if (session.createdAt && Date.now() - session.createdAt > MAX_SESSION_AGE) {
    await c.env.KV.delete(`session:${cookie}`);
    throw new AppError(401, 'Session expired');
  }

  c.set('userId', session.userId);
  c.set('session', session);

  // Sliding window: extend session TTL on each valid request
  await c.env.KV.put(`session:${cookie}`, sessionJson, {
    expirationTtl: 60 * 60 * 24 * 7, // 7 days
  });

  await next();
});
```

- [ ] **Step 7: Commit**

```bash
cd packages/worker
git add src/routes/auth.ts src/middleware/auth-guard.ts
git commit -m "feat(security): harden auth with password policy, session lifetime, PKCE, token encryption"
```

---

### Task 9: Harden Shared Routes (IDOR Fixes, JWT_SECRET, Webhook Validation, Error Sanitization) + Drives + Workspaces

**Files:**
- Modify: `packages/worker/src/routes/shared.ts`
- Modify: `packages/worker/src/routes/drives.ts`
- Modify: `packages/worker/src/routes/workspaces.ts:57-98`
- Modify: `packages/worker/src/services/google-drive.ts:42-86`
- Modify: `packages/worker/src/middleware/cors.ts`

- [ ] **Step 1: Fix IDOR in shared link creation (shared.ts)**

In `packages/worker/src/routes/shared.ts`, add import at line 9 (after `GoogleDriveService` import):

```ts
import { validateWebhookUrl } from '../lib/validation';
import { encrypt, decryptOrPassthrough } from '../lib/crypto';
```

In the `POST /` handler (after line 62 `if (!targetType || !targetId) ...`), add ownership verification:

```ts
  // Verify ownership of target
  if (targetType === 'file') {
    const file = await db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ?').bind(targetId, userId).first();
    if (!file) return c.json({ error: 'You do not own this file' }, 403);
  } else if (targetType === 'folder') {
    const folder = await db.prepare('SELECT id FROM virtual_folders WHERE id = ? AND user_id = ?').bind(targetId, userId).first();
    if (!folder) return c.json({ error: 'You do not own this folder' }, 403);
  }

  // Validate webhook URL if provided
  if (webhookUrl) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
```

- [ ] **Step 2: Increase shared link ID length**

In `packages/worker/src/routes/shared.ts` line 105, replace:

```ts
    id = generateId().slice(0, 8); // Short slug
```

with:

```ts
    id = generateId().replace(/-/g, '').slice(0, 16); // 64-bit entropy slug
```

- [ ] **Step 3: Sanitize error in shared link creation**

In `packages/worker/src/routes/shared.ts` line 118, replace:

```ts
        return c.json({ error: 'Failed to create shared link', details: e.message }, 500);
```

with:

```ts
        console.error('Error creating shared link:', e);
        return c.json({ error: 'Failed to create shared link' }, 500);
```

- [ ] **Step 4: Fix JWT signing — use JWT_SECRET with expiration**

In `packages/worker/src/routes/shared.ts` line 35, replace:

```ts
      const payload = await verify(sessionCookie, c.env.GOOGLE_CLIENT_SECRET, 'HS256');
```

with:

```ts
      const payload = await verify(sessionCookie, c.env.JWT_SECRET, 'HS256');
```

In line 331, replace:

```ts
  const token = await sign({ id }, c.env.GOOGLE_CLIENT_SECRET, 'HS256');
```

with:

```ts
  const token = await sign({ id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }, c.env.JWT_SECRET, 'HS256');
```

- [ ] **Step 5: Fix IDOR in download — add ownership scoping**

In `packages/worker/src/routes/shared.ts`, replace lines 378-382:

```ts
    const file = await db.prepare('SELECT * FROM files WHERE id = ?').bind(link.targetId).first();
    if (!file) return c.text('File not found', 404);

    const driveAccount = await db.prepare('SELECT * FROM drive_accounts WHERE id = ?').bind(file.drive_account_id).first();
    if (!driveAccount) return c.text('Drive account not found', 404);
```

with:

```ts
    const file = await db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').bind(link.targetId, link.userId).first();
    if (!file) return c.text('File not found', 404);

    const driveAccount = await db.prepare('SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?').bind(file.drive_account_id, link.userId).first();
    if (!driveAccount) return c.text('Drive account not found', 404);
```

- [ ] **Step 6: Sanitize download error**

In `packages/worker/src/routes/shared.ts` line 408, replace:

```ts
      return c.text(`Failed to download file: ${e.message}`, 502);
```

with:

```ts
      return c.text('Failed to download file', 502);
```

- [ ] **Step 7: Add webhook validation to PUT handler**

In `packages/worker/src/routes/shared.ts` PUT handler, after line 172 (after destructuring `body`), add:

```ts
  if (webhookUrl && webhookUrl !== existing.webhook_url) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
```

- [ ] **Step 8: Add token encryption to drives.ts**

In `packages/worker/src/routes/drives.ts`, add import at top:

```ts
import { encrypt, decryptOrPassthrough } from '../lib/crypto';
```

In the `GET /` handler (line 74), replace:

```ts
    const tokenJson = await c.env.KV.get(`tokens:${drive.id}`);
```

with:

```ts
    const encryptedTokens = await c.env.KV.get(`tokens:${drive.id}`);
    if (!encryptedTokens) return { ...drive, freeSpace: 0, usagePercent: 0 };
    const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);
```

And remove line 75 (`if (!tokenJson) return ...`) since it's handled above.

Also remove line 82 (`await c.env.KV.put(\`oauth:${drive.id}\`, tokenJson);`) — no longer needed, we're consolidating to `tokens:` prefix.

In the lazy folder sync handler (line 222), replace:

```ts
  const tokenJson = await c.env.KV.get(`tokens:${driveId}`) ?? await c.env.KV.get(`oauth:${driveId}`);
  if (!tokenJson) return c.json({ error: 'No tokens for drive' }, 400);

  // Ensure available under oauth: prefix for GoogleDriveService
  await c.env.KV.put(`oauth:${driveId}`, tokenJson);
```

with:

```ts
  const encryptedTokens = await c.env.KV.get(`tokens:${driveId}`);
  if (!encryptedTokens) return c.json({ error: 'No tokens for drive' }, 400);
  const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);

  // Store decrypted under oauth: prefix for GoogleDriveService (temporary, until service is updated)
  await c.env.KV.put(`oauth:${driveId}`, tokenJson);
```

- [ ] **Step 9: Update GoogleDriveService to decrypt tokens**

In `packages/worker/src/services/google-drive.ts`, the `getValidToken` method (line 42-57) reads from `oauth:` prefix. Update the constructor and `getValidToken` to accept optional encryption key and decrypt:

Add to class fields (after line 37):

```ts
  private encryptionKey?: string;
```

Update constructor (line 34-38):

```ts
  constructor(
    private kv: KVNamespace,
    private clientId: string,
    private clientSecret: string,
    encryptionKey?: string
  ) {
    this.encryptionKey = encryptionKey;
  }
```

In `getValidToken` (line 43), replace:

```ts
    const tokensJson = await this.kv.get(`oauth:${driveAccountId}`);
    if (!tokensJson) {
      throw new Error(`No tokens found for drive ${driveAccountId}`);
    }

    const tokens: OAuthTokens = JSON.parse(tokensJson);
```

with:

```ts
    // Try tokens: prefix first (new), fallback to oauth: (legacy)
    const raw = await this.kv.get(`tokens:${driveAccountId}`) ?? await this.kv.get(`oauth:${driveAccountId}`);
    if (!raw) {
      throw new Error(`No tokens found for drive ${driveAccountId}`);
    }

    let tokensJson = raw;
    if (this.encryptionKey) {
      // Try decrypt; passthrough if it's legacy plain text
      try {
        tokensJson = await (await import('../lib/crypto')).decryptOrPassthrough(raw, this.encryptionKey);
      } catch {
        // Fallback to raw
      }
    }

    const tokens: OAuthTokens = JSON.parse(tokensJson);
```

In `refreshToken` (line 79-86), update token storage to encrypt and use `tokens:` prefix:

Replace:

```ts
    await this.kv.put(
      `oauth:${driveAccountId}`,
      JSON.stringify({
        accessToken: data.access_token,
        refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
      } satisfies OAuthTokens)
    );
```

with:

```ts
    const newTokens = JSON.stringify({
      accessToken: data.access_token,
      refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    } satisfies OAuthTokens);

    if (this.encryptionKey) {
      const { encrypt } = await import('../lib/crypto');
      const encrypted = await encrypt(newTokens, this.encryptionKey);
      await this.kv.put(`tokens:${driveAccountId}`, encrypted);
    } else {
      await this.kv.put(`oauth:${driveAccountId}`, newTokens);
    }
```

- [ ] **Step 10: Add role escalation prevention to workspaces.ts**

In `packages/worker/src/routes/workspaces.ts`, in the `POST /:id/members` handler, add after line 70 (after the `hasPermission` check):

```ts
  // Prevent role escalation: can't assign role >= own role
  const levels: Record<string, number> = { 'viewer': 1, 'auditor': 1, 'commenter': 2, 'editor': 3, 'manager': 4, 'owner': 5 };
  const assignerLevel = levels[currentUserRole] || 0;
  const targetLevel = levels[role] || 0;
  if (targetLevel >= assignerLevel) {
    return c.json({ error: 'Cannot assign a role equal to or higher than your own' }, 403);
  }
```

- [ ] **Step 11: Tighten CORS localhost matching**

Replace `packages/worker/src/middleware/cors.ts` entirely:

```ts
import { cors } from 'hono/cors';
import type { Env } from '../types/env';

export function corsMiddleware() {
  return cors({
    origin: (origin, c) => {
      const env = c.env as Env;
      const allowed = [env.FRONTEND_URL];
      if (allowed.includes(origin)) {
        return origin;
      }
      // Only allow localhost in development (when FRONTEND_URL is localhost)
      const isDev = env.FRONTEND_URL?.includes('localhost');
      if (isDev && origin && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin;
      }
      return '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 86400,
  });
}
```

- [ ] **Step 12: Commit**

```bash
cd packages/worker
git add src/routes/shared.ts src/routes/drives.ts src/routes/workspaces.ts src/services/google-drive.ts src/middleware/cors.ts
git commit -m "feat(security): fix IDOR vulnerabilities, harden JWT, encrypt tokens, prevent SSRF and role escalation"
```

---

### Task 10: Register Middleware Chain in index.ts + Update AuthService + README

**Files:**
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/worker/src/services/auth.service.ts` (if PKCE param needed)
- Modify: `README.md` (project root)

- [ ] **Step 1: Update index.ts with new middleware chain**

Replace `packages/worker/src/index.ts` entirely:

```ts
import { Hono } from 'hono';
import type { AppContext, Env } from './types/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { securityHeaders } from './middleware/security-headers';
import { csrfGuard } from './middleware/csrf-guard';
import { rateLimiter } from './middleware/rate-limiter';
import { runScheduledSync } from './services/sync';
import { AuditService } from './services/audit.service';
import { PolicyService } from './services/policy.service';

import { authRouter } from './routes/auth';
import { drivesRouter } from './routes/drives';
import { foldersRouter } from './routes/folders';
import { filesRouter } from './routes/files';
import { sharedRouter } from './routes/shared';
import { automationsRouter } from './routes/automations';
import { workspacesRouter } from './routes/workspaces';
import { adminRouter } from './routes/admin';
import { AutomationEngine } from './services/automation.service';

export const app = new Hono<AppContext>({ strict: false });

// Global middleware
app.use('*', securityHeaders);
app.use('*', corsMiddleware());
app.use('*', errorHandler);
app.use('/api/*', csrfGuard);

// Rate limiters — applied before auth to protect login/register
app.use('/api/auth/login', rateLimiter({ windowMs: 60_000, maxRequests: 5 }));
app.use('/api/auth/register', rateLimiter({ windowMs: 600_000, maxRequests: 3 }));
app.use('/api/shared/:id/verify', rateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyFn: (c: any) => {
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Real-IP') ?? 'unknown';
    const id = c.req.param('id') ?? 'unknown';
    return `${ip}:${id}`;
  },
}));
app.use('/api/*', rateLimiter({ windowMs: 60_000, maxRequests: 100 }));

// Routes
app.route('/api/auth', authRouter);
app.route('/api/drives', drivesRouter);
app.route('/api/folders', foldersRouter);
app.route('/api/files', filesRouter);
app.route('/api/shared', sharedRouter);
app.route('/api/automations', automationsRouter);
app.route('/api/workspaces', workspacesRouter);
app.route('/api/admin', adminRouter);

// Health check (public)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    console.log('Cron triggered:', event.cron);
    ctx.waitUntil(runScheduledSync(env));
    const engine = new AutomationEngine(env);
    ctx.waitUntil(engine.processCronTrigger(ctx));

    // Audit log cleanup
    const auditService = new AuditService(env.DB);
    ctx.waitUntil(auditService.cleanupOldLogs(30));

    // Data retention policies
    const policyService = new PolicyService(env.DB);
    ctx.waitUntil(policyService.processAutoDeleteRetentionPolicies(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.KV));
  },
} satisfies ExportedHandler<Env>;

export type { Env } from './types/env';
```

- [ ] **Step 2: Update AuthService to accept PKCE codeVerifier**

Check `packages/worker/src/services/auth.service.ts` for `exchangeCodeForTokens`. Add optional `codeVerifier` param:

Find the method signature and update it to:

```ts
async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier?: string)
```

In the `URLSearchParams` body of the token exchange request, add:

```ts
if (codeVerifier) {
  params.append('code_verifier', codeVerifier);
}
```

- [ ] **Step 3: Update README.md environment variables section**

In the project root `README.md`, find the "Worker Secrets" table (around line 175) and add the new variables:

After the `GOOGLE_CLIENT_SECRET` row, add:

```markdown
| `JWT_SECRET` | Dedicated JWT signing key for shared links (min 32 chars) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for encrypting OAuth tokens at rest (32 chars) |
```

- [ ] **Step 4: Run full test suite**

Run: `cd packages/worker && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/worker
git add src/index.ts src/services/auth.service.ts
cd ../..
git add README.md
git commit -m "feat(security): register security middleware chain and update documentation

Complete security hardening:
- CSRF guard on all mutating API endpoints
- Rate limiting on login, register, shared link verify, and global API
- Security headers (X-Frame-Options, CSP, HSTS, etc.)
- IDOR fixes on shared link creation and download
- JWT dedicated signing key with expiration
- AES-256-GCM encryption for OAuth tokens at rest
- PKCE S256 for OAuth flow
- Password complexity requirements
- Webhook URL SSRF prevention
- CORS localhost tightening
- Error message sanitization
- Role escalation prevention
- Absolute session lifetime (30-day cap)"
```
