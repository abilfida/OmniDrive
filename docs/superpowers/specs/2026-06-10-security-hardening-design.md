# OmniDrive Security Hardening — Design Spec

**Date**: 2026-06-10
**Status**: Approved
**Scope**: CRITICAL + HIGH findings + related MEDIUM fixes
**Approach**: Security Middleware Layer (Opsi A) — composable Hono middleware + service utilities

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Audit Findings Summary](#audit-findings-summary)
3. [Section 1: IDOR Fixes — Shared Link Ownership Verification](#section-1-idor-fixes)
4. [Section 2: JWT Security & Session Hardening](#section-2-jwt-security--session-hardening)
5. [Section 3: CSRF Protection](#section-3-csrf-protection)
6. [Section 4: Rate Limiting & Password Policy](#section-4-rate-limiting--password-policy)
7. [Section 5: OAuth Token Encryption](#section-5-oauth-token-encryption)
8. [Section 6: OAuth PKCE + Security Headers + MEDIUM Fixes](#section-6-oauth-pkce--security-headers--medium-fixes)
9. [New Files Summary](#new-files-summary)
10. [New Environment Variables](#new-environment-variables)
11. [Middleware Registration Order](#middleware-registration-order)
12. [Out of Scope (Deferred to Next Iteration)](#out-of-scope)

---

## Executive Summary

A comprehensive security audit of OmniDrive (both backend Worker and frontend React SPA) identified **~38 findings** across 6 categories. This spec addresses all **3 CRITICAL**, **8 HIGH**, and **6 related MEDIUM** findings — totaling **17 fixes** in this iteration.

The architecture follows **Opsi A: Security Middleware Layer** — each fix is implemented as a composable Hono middleware or isolated service utility, following the existing codebase patterns.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rate Limiting | In-memory sliding window (Map) | Platform-agnostic (Docker + Cloudflare Workers), lightweight, no external deps |
| Token Encryption | AES-256-GCM via Web Crypto API | Native in Workers & Node.js, industry standard, zero dependencies |
| CSRF Protection | Origin/Referer header validation | Lightweight, no state, effective for JSON API |
| Password Policy | Min 8 chars, uppercase, lowercase, number | Balances security with usability |

---

## Audit Findings Summary

### In Scope (This Spec)

| # | Finding | Severity | Section |
|---|---------|----------|---------|
| 1 | Shared link creation lacks target ownership verification | **CRITICAL** | 1 |
| 2 | Shared link download has no ownership check (IDOR) | **CRITICAL** | 1 |
| 3 | GOOGLE_CLIENT_SECRET reused as JWT signing key, no `exp` | **CRITICAL** | 2 |
| 4 | No CSRF protection (backend + frontend confirm) | **HIGH** | 3 |
| 5 | No rate limiting on any endpoint | **HIGH** | 4 |
| 6 | No password complexity requirements | **HIGH** | 4 |
| 7 | No brute-force protection on login | **HIGH** | 4 |
| 8 | OAuth tokens stored unencrypted in KV | **HIGH** | 5 |
| 9 | No PKCE in OAuth flow | **HIGH** | 6 |
| 10 | No security headers (CSP, X-Frame-Options, HSTS) | **HIGH** | 6 |
| 11 | Manager can escalate roles to owner | **HIGH** | 1 |
| 12 | Sliding window sessions never expire (no absolute cap) | **MEDIUM** | 2 |
| 13 | SSRF via webhook URLs | **MEDIUM** | 6 |
| 14 | CORS allows any localhost in production | **MEDIUM** | 6 |
| 15 | Error messages leak internal details | **MEDIUM** | 6 |
| 16 | Dual KV key prefixes for tokens | **MEDIUM** | 5 |
| 17 | Shared link IDs too short (32-bit entropy) | **MEDIUM** | 1 |

### Positive Findings (No Action Needed)

- ✅ All SQL queries use parameterized `.bind()` — no SQL injection
- ✅ No `dangerouslySetInnerHTML`, `innerHTML`, or `eval()` in frontend
- ✅ Cookie-based auth with `credentials: 'include'` (no tokens in localStorage)
- ✅ No sensitive data in Zustand stores
- ✅ OAuth `state` parameter validated
- ✅ Passwords hashed with bcrypt
- ✅ All external links use `noopener,noreferrer`

---

## Section 1: IDOR Fixes

### 1a. Shared Link Creation — Ownership Verification

**File**: `src/routes/shared.ts` — `POST /` handler

Before the `INSERT INTO shared_links` query, add ownership verification:

```ts
if (targetType === 'file') {
  const file = await db.prepare(
    'SELECT id FROM files WHERE id = ? AND user_id = ?'
  ).bind(targetId, userId).first();
  if (!file) throw new AppError(403, 'You do not own this file');
} else if (targetType === 'folder') {
  const folder = await db.prepare(
    'SELECT id FROM virtual_folders WHERE id = ? AND user_id = ?'
  ).bind(targetId, userId).first();
  if (!folder) throw new AppError(403, 'You do not own this folder');
}
```

### 1b. Shared Link Download — Ownership Scoped Queries

**File**: `src/routes/shared.ts` — `GET /:id/download` handler

Add `AND user_id = ?` binding `link.userId` to all downstream queries:

```ts
// File lookup
const file = await db.prepare(
  'SELECT * FROM files WHERE id = ? AND user_id = ?'
).bind(link.targetId, link.userId).first();
if (!file) throw new AppError(404, 'File not found');

// Drive account lookup
const driveAccount = await db.prepare(
  'SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?'
).bind(file.drive_account_id, link.userId).first();
if (!driveAccount) throw new AppError(404, 'Drive account not found');
```

### 1c. Role Escalation Prevention

**File**: `src/routes/workspaces.ts` — `POST /:id/members` handler

Validate that assigned role is strictly lower than assigner's role:

```ts
const assignerLevel = levels[assignerRole];
const targetLevel = levels[role];
if (targetLevel >= assignerLevel) {
  throw new AppError(403, 'Cannot assign a role equal to or higher than your own');
}
```

### 1d. Longer Shared Link IDs

**File**: `src/routes/shared.ts` — ID generation

Change from 8-char to 16-char slug for ~64 bits of entropy:

```ts
// Before: id = generateId().slice(0, 8);
id = generateId().replace(/-/g, '').slice(0, 16);
```

---

## Section 2: JWT Security & Session Hardening

### 2a. Dedicated JWT Signing Key

**File**: `src/routes/shared.ts`

Replace all uses of `c.env.GOOGLE_CLIENT_SECRET` for JWT operations with `c.env.JWT_SECRET`.

Add `exp` claim (24-hour expiration) to all generated JWTs:

```ts
// Signing
const token = await sign(
  { id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 },
  c.env.JWT_SECRET,
  'HS256'
);

// Verification (hono/jwt auto-checks exp)
const payload = await verify(sessionCookie, c.env.JWT_SECRET, 'HS256');
```

### 2b. Absolute Session Lifetime

**File**: `src/middleware/auth-guard.ts`

Add `createdAt` to session data. Enforce 30-day absolute max:

```ts
const MAX_SESSION_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

const session = JSON.parse(sessionJson);
if (Date.now() - session.createdAt > MAX_SESSION_AGE) {
  await c.env.KV.delete(`session:${cookie}`);
  throw new AppError(401, 'Session expired');
}
```

**File**: `src/routes/auth.ts` — login handler

Store `createdAt` in session data:

```ts
const sessionData = {
  userId: user.id,
  createdAt: Date.now(),
};
```

---

## Section 3: CSRF Protection

### New File: `src/middleware/csrf-guard.ts`

Origin/Referer header validation middleware for all mutating requests (POST, PUT, PATCH, DELETE).

**Behavior**:
- Skip safe methods (GET, HEAD, OPTIONS)
- Check `Origin` header against `FRONTEND_URL` and `WORKER_URL`
- Fallback to `Referer` header if no `Origin`
- Block if neither header present
- Exempt paths: `/api/shared/` (public), `/api/auth/google/callback` (OAuth)

```ts
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Only exempt truly public endpoints — NOT /api/shared (create/edit/delete need CSRF)
const CSRF_EXEMPT_PATHS = [
  '/api/auth/google/callback',  // OAuth callback from Google
  '/api/auth/login',            // Login (no session yet)
  '/api/auth/register',         // Registration (no session yet)
];

// Public shared link endpoints use a separate check:
// GET /api/shared/:id and POST /api/shared/:id/verify are exempt
// because they are accessed by unauthenticated users
function isPublicSharedEndpoint(method: string, path: string): boolean {
  const sharedMatch = path.match(/^\/api\/shared\/[^/]+/);
  if (!sharedMatch) return false;
  // GET /api/shared/:id (view) and /api/shared/:id/download
  if (method === 'GET') return true;
  // POST /api/shared/:id/verify (password check)
  if (method === 'POST' && path.endsWith('/verify')) return true;
  return false;
}

export const csrfGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (SAFE_METHODS.includes(c.req.method)) return next();

  const path = new URL(c.req.url).pathname;
  if (CSRF_EXEMPT_PATHS.some(p => path.startsWith(p))) return next();
  if (isPublicSharedEndpoint(c.req.method, path)) return next();

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
    const refererOrigin = new URL(referer).origin;
    if (!allowedOrigins.includes(refererOrigin)) {
      return c.json({ error: 'CSRF validation failed' }, 403);
    }
    return next();
  }

  return c.json({ error: 'CSRF validation failed' }, 403);
});
```

---

## Section 4: Rate Limiting & Password Policy

### New File: `src/middleware/rate-limiter.ts`

In-memory sliding window rate limiter using `Map`. Platform-agnostic (works in both Cloudflare Workers isolates and Docker/Node.js).

**Features**:
- Configurable window size and max requests per endpoint
- Custom key function support (default: IP-based via `CF-Connecting-IP` / `X-Real-IP`)
- Automatic cleanup of stale entries every 5 minutes
- Returns `429 Too Many Requests` with `Retry-After` header

**Endpoint Configurations**:

| Endpoint | Window | Max Requests | Key |
|----------|--------|-------------|-----|
| `POST /api/auth/login` | 1 min | 5 | IP |
| `POST /api/auth/register` | 10 min | 3 | IP |
| `POST /api/shared/:id/verify` | 1 min | 5 | IP + link ID |
| `GET/POST /api/*` (global) | 1 min | 100 | IP |

### New File: `src/lib/validation.ts`

Password validation utility:

```ts
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}
```

Applied in `src/routes/auth.ts` register handler before bcrypt hashing.

---

## Section 5: OAuth Token Encryption

### New File: `src/lib/crypto.ts`

AES-256-GCM encryption/decryption using Web Crypto API (native, zero dependencies).

**Functions**:
- `encrypt(plaintext, secret)` → base64-encoded `iv + ciphertext`
- `decrypt(encoded, secret)` → original plaintext
- `decryptOrPassthrough(value, secret)` → tries decrypt, falls back to plain text for migration

**Storage Format**: `base64(12-byte-IV + AES-GCM-ciphertext)`

**Integration Points**:
- **Write**: `src/routes/drives.ts` — token save after OAuth callback
- **Write**: `src/routes/auth.ts` — token save after Google auth
- **Read**: `src/services/google-drive.ts` — token read for API calls
- **Read**: `src/routes/shared.ts` — token read for shared link downloads

**Migration Strategy**: Use `decryptOrPassthrough()` for reads. Legacy plain-text tokens are automatically re-encrypted on next token refresh cycle. Zero-downtime migration.

**Token Key Prefix Consolidation**: Migrate from dual `tokens:` / `oauth:` prefixes to single `tokens:` prefix. The `decryptOrPassthrough()` function handles both old and new formats during transition.

---

## Section 6: OAuth PKCE + Security Headers + MEDIUM Fixes

### 6a. PKCE (S256)

**New File**: `src/lib/pkce.ts`

```ts
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}>
```

**Integration**:
- Store `codeVerifier` in KV alongside OAuth `state` (with 10-min TTL)
- Add `code_challenge` + `code_challenge_method=S256` to authorization URL
- Add `code_verifier` to token exchange request

**Files Modified**: `src/routes/auth.ts`, `src/routes/drives.ts`

### 6b. Security Headers — Nginx

**File**: `nginx-unified.conf`

Add headers:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://*.googleusercontent.com data:; connect-src 'self'" always;
server_tokens off;
```

### 6c. Security Headers — Hono Middleware

**New File**: `src/middleware/security-headers.ts`

Same headers as nginx, applied as Hono middleware for Cloudflare Workers deployment (where nginx is not used).

### 6d. SSRF Prevention — Webhook URL Validation

**File**: `src/lib/validation.ts` — add `validateWebhookUrl()`

- Require HTTPS protocol
- Block private/reserved IP ranges: `127.0.0.1`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.169.254`
- Block `localhost` hostname

Applied in `src/routes/shared.ts` before storing webhook URL.

### 6e. CORS Tightening

**File**: `src/middleware/cors.ts`

- Only allow `localhost` origins when `FRONTEND_URL` contains `localhost` (dev mode)
- Use strict regex match: `/^http:\/\/localhost(:\d+)?$/`

### 6f. Error Message Sanitization

**All route files** — replace `details: e.message` with server-side logging only:

```ts
// Before:
return c.json({ error: 'Failed to create shared link', details: e.message }, 500);

// After:
console.error('Failed to create shared link:', e);
return c.json({ error: 'Failed to create shared link' }, 500);
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/middleware/csrf-guard.ts` | CSRF protection via Origin/Referer validation |
| `src/middleware/rate-limiter.ts` | In-memory sliding window rate limiter |
| `src/middleware/security-headers.ts` | Security response headers |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for token storage |
| `src/lib/pkce.ts` | PKCE code verifier/challenge generation |
| `src/lib/validation.ts` | Password policy + webhook URL validation |

## Modified Files Summary

| File | Changes |
|------|---------|
| `src/routes/shared.ts` | IDOR ownership checks, JWT_SECRET, longer IDs, error sanitization, webhook validation |
| `src/routes/auth.ts` | Password validation, session createdAt, PKCE |
| `src/routes/drives.ts` | Token encryption on write, PKCE |
| `src/routes/workspaces.ts` | Role escalation prevention |
| `src/services/google-drive.ts` | Token decryption on read |
| `src/middleware/auth-guard.ts` | Absolute session lifetime check |
| `src/middleware/cors.ts` | Strict localhost matching |
| `src/index.ts` | Register new middleware (csrf, rate-limiter, security-headers) |
| `src/types/env.ts` (or equivalent) | Add `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` to Env type |
| `nginx-unified.conf` | Security headers, server_tokens off |
| `wrangler.example.toml` | Document new secrets |
| `.dev.vars.example` | Document new secrets |
| `README.md` | Document new environment variables |

---

## New Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `JWT_SECRET` | Secret (`wrangler secret put`) | Dedicated HMAC signing key for shared link session JWTs. Min 32 characters, randomly generated. |
| `TOKEN_ENCRYPTION_KEY` | Secret (`wrangler secret put`) | AES-256-GCM key for encrypting OAuth tokens at rest. Exactly 32 characters, randomly generated. |

---

## Middleware Registration Order

```ts
// src/index.ts
app.use('*', securityHeaders);  // 1. Security response headers (all requests)
app.use('*', corsMiddleware);   // 2. CORS (existing)
app.use('/api/*', csrfGuard);   // 3. CSRF validation (mutating API requests)

// Rate limiters (before auth, to protect login/register)
app.use('/api/auth/login', rateLimiter({ windowMs: 60000, maxRequests: 5 }));
app.use('/api/auth/register', rateLimiter({ windowMs: 600000, maxRequests: 3 }));
app.use('/api/shared/:id/verify', rateLimiter({ windowMs: 60000, maxRequests: 5, keyFn: ipPlusId }));
app.use('/api/*', rateLimiter({ windowMs: 60000, maxRequests: 100 }));

app.use('/api/*', authGuard);   // 5. Auth guard (existing)

// Route registration...
```

---

## Out of Scope (Deferred to Next Iteration)

These MEDIUM and LOW findings will be addressed in a follow-up spec:

| Finding | Severity | Reason Deferred |
|---------|----------|----------------|
| UUIDv4 as session token (vs CSPRNG) | MEDIUM | Low practical risk, UUIDv4 has 122-bit entropy |
| No password change functionality | MEDIUM | Feature addition, not a vulnerability fix |
| RBAC auditor/viewer level collision | MEDIUM | Requires RBAC model redesign |
| Dynamic SQL in folder update | MEDIUM | Currently safe, field names are hardcoded |
| Arbitrary metadata JSON without schema | LOW | Storage abuse, not security-critical |
| Console.log leaking data in prod (frontend) | LOW | Low severity, browser console only |
| Admin page client-side role check | MEDIUM | Backend must enforce, frontend is cosmetic |
| No global 401 handler in frontend | MEDIUM | UX issue, not security |
| Docker runs as root | MEDIUM | Infrastructure change |
| No dependency vulnerability scanning | LOW | CI/CD improvement |
| test.db and SQL exports in repo | LOW | Cleanup task |
| AuthGuard uses window.location.href | LOW | UX issue |
