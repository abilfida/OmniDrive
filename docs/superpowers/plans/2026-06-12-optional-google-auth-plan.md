# Optional Google Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google OAuth Credentials optional during setup, allowing users to rely solely on Service Accounts.

**Architecture:** We will modify the CLI wizard to prompt whether the user wants to configure Google OAuth. If skipped, empty values will be set. In the backend, we will add guard clauses to the `/connect` and `/google` routes to reject requests when Google Auth is not configured.

**Tech Stack:** Node.js (CLI), Hono (Cloudflare Workers Backend)

---

### Task 1: Update CLI Onboarding Prompt

**Files:**
- Modify: `scripts/onboard-deploy.mjs`

- [ ] **Step 1: Add confirmation prompt for Google OAuth**

Update `scripts/onboard-deploy.mjs` to ask whether the user wants to configure Google OAuth, and only prompt for the Client ID and Secret if they choose yes.

Look for the existing `clientId` and `clientSecret` prompts. Replace them with the following block:

```javascript
    const useOAuth = checkCancel(await confirm({
      message: 'Do you want to configure Google OAuth Credentials now? (You can skip this if you plan to use a Service Account later)',
      initialValue: true,
    }));

    let clientId = '';
    let clientSecret = '';

    if (useOAuth) {
      clientId = checkCancel(await text({
        message: 'Enter your Google OAuth Client ID:',
        validate(value) {
          if (value.length === 0) return 'Client ID is required';
        }
      }));

      clientSecret = checkCancel(await text({
        message: 'Enter your Google OAuth Client Secret:',
        validate(value) {
          if (value.length === 0) return 'Client Secret is required';
        }
      }));
    }
```

*Note: You don't need to change the lines where `envContent` or Cloudflare secrets are generated; they will naturally use the empty strings.*

- [ ] **Step 2: Commit changes**

```bash
rtk git add scripts/onboard-deploy.mjs
rtk git commit -m "feat: make Google OAuth credentials optional in deployment wizard"
```

### Task 2: Protect Drive Connection Route

**Files:**
- Modify: `packages/worker/src/routes/drives.ts`

- [ ] **Step 1: Import AppError**

At the top of `packages/worker/src/routes/drives.ts`, add the import for `AppError`:

```typescript
import { AppError } from '../middleware/error-handler';
```

- [ ] **Step 2: Add guard clause to `/connect` route**

Find `drivesRouter.get('/connect', (c) => {`. Add a check for `c.env.GOOGLE_CLIENT_ID` and `c.env.GOOGLE_CLIENT_SECRET`.

```typescript
drivesRouter.get('/connect', (c) => {
  const env = c.env;
  
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Google OAuth is not configured. Please use a Service Account JSON to connect your drives.');
  }

  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
// ... existing code ...
```

- [ ] **Step 3: Run tests to ensure no compilation errors**

```bash
npm run test -w packages/worker
```

- [ ] **Step 4: Commit changes**

```bash
rtk git add packages/worker/src/routes/drives.ts
rtk git commit -m "feat: protect drive connect route if OAuth is not configured"
```

### Task 3: Protect Google Sign-In Route

**Files:**
- Modify: `packages/worker/src/routes/auth.ts`

- [ ] **Step 1: Add guard clause to `/google` route**

In `packages/worker/src/routes/auth.ts`, find `authRouter.get('/google', async (c) => {`. Add a check for `c.env.GOOGLE_CLIENT_ID` and `c.env.GOOGLE_CLIENT_SECRET`.

```typescript
authRouter.get('/google', async (c) => {
  const env = c.env;
  
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Google OAuth is not configured. Please login with username and password.');
  }

  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
// ... existing code ...
```

- [ ] **Step 2: Run tests to ensure no compilation errors**

```bash
npm run test -w packages/worker
```

- [ ] **Step 3: Commit changes**

```bash
rtk git add packages/worker/src/routes/auth.ts
rtk git commit -m "feat: protect google sign-in route if OAuth is not configured"
```
