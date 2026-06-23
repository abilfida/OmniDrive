# Workspace Scoped S3 Object Storage API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement workspace-scoped and global (hybrid) S3 API Keys generated directly from the global Settings page of the dashboard, restricting S3 API access strictly to target workspaces for scoped keys.

**Architecture:** Extend `s3_credentials` table with a nullable `workspace_id` column. Update the backend API routers to check user's roles (`manager` or `owner`) in target workspaces during credential generation. Modify the S3 authentication middleware to store the scoped workspace in context, and enforce bucket/object access checks dynamically. Implement key generation and revoking UI inside the global Settings dashboard (`SettingsPage.tsx`) using a Workspace Scope dropdown.

**Tech Stack:** TypeScript, React, TailwindCSS, Hono, D1/SQLite, Vitest.

## Global Constraints
- None

---

### Task 1: Database Migration

**Files:**
- Modify: `packages/worker/src/db/schema.sql`

**Interfaces:**
- Consumes: None
- Produces: SQLite schema with updated `s3_credentials` table including `workspace_id` column.

- [ ] **Step 1: Update schema.sql with new column**
  Modify `packages/worker/src/db/schema.sql` to include `workspace_id` in `s3_credentials` table definition:
  ```sql
  -- Track user generated S3 Credentials
  CREATE TABLE IF NOT EXISTS s3_credentials (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_key_id     TEXT UNIQUE NOT NULL,
      secret_key_enc    TEXT NOT NULL,
      description       TEXT,
      workspace_id      TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```

- [ ] **Step 2: Apply the migration locally using wrangler/sqlite**
  Run local D1 migrations or apply command:
  ```bash
  npx wrangler d1 execute omnidrive-db --local --command="ALTER TABLE s3_credentials ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;"
  ```
  Expected: Command completes successfully.

- [ ] **Step 3: Run schema test to verify structure**
  Run: `npm run test --prefix packages/worker packages/worker/tests/schema.test.ts`
  Expected: PASS

- [ ] **Step 4: Commit schema changes**
  Run:
  ```bash
  git add packages/worker/src/db/schema.sql
  git commit -m "migration: add workspace_id to s3_credentials table"
  ```

---

### Task 2: Backend S3 Credentials Routing and Validation

**Files:**
- Modify: `packages/worker/src/routes/s3-credentials.ts`
- Test: `packages/worker/tests/s3-credentials.test.ts`

**Interfaces:**
- Consumes: Database schema changes from Task 1.
- Produces: Updated endpoints `POST /api/s3-credentials` (scoped validation) and `GET /api/s3-credentials` (including workspace details).

- [ ] **Step 1: Write a failing unit test for workspace role validation**
  Open `packages/worker/tests/s3-credentials.test.ts` and add tests asserting:
  - Scoped key creation with invalid workspace permissions (role as `viewer`) fails with `403 Forbidden`.
  - Scoped key creation with valid workspace permissions (role as `manager`) succeeds with `201 Created` and sets `workspace_id` in database.
  - S3 credentials list (`GET`) returns workspace details if scoped.
  
  Code to add:
  ```typescript
  it('enforces manager/owner permissions when scoping key to a workspace', async () => {
    // Write test body following mockDb framework in s3-credentials.test.ts...
  });
  ```

- [ ] **Step 2: Run vitest to verify test fails**
  Run: `npx vitest run packages/worker/tests/s3-credentials.test.ts`
  Expected: FAIL (assertion fails or route doesn't validate workspace role / fails on SQL syntax)

- [ ] **Step 3: Modify POST endpoint to enforce workspace scope role validation**
  Update the handler of `s3CredentialsRouter.post('/', ...)` to:
  1. Retrieve `workspaceId` from JSON body.
  2. If `workspaceId` is provided, run query to find membership role:
     ```sql
     SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
     ```
  3. Validate that role is `'manager'` or `'owner'`. If not, return `c.json({ error: 'Unauthorized to manage S3 keys for this workspace' }, 403)`.
  4. Perform DB insert including `workspace_id` column.

- [ ] **Step 4: Modify GET endpoint to retrieve workspace name**
  Update `s3CredentialsRouter.get('/', ...)` to use the left join query:
  ```sql
  SELECT c.id, c.access_key_id, c.description, c.created_at, c.workspace_id, w.name as workspace_name
  FROM s3_credentials c
  LEFT JOIN workspaces w ON c.workspace_id = w.id
  WHERE c.user_id = ?
  ```

- [ ] **Step 5: Run tests to verify they pass**
  Run: `npx vitest run packages/worker/tests/s3-credentials.test.ts`
  Expected: PASS

- [ ] **Step 6: Commit changes**
  Run:
  ```bash
  git add packages/worker/src/routes/s3-credentials.ts packages/worker/tests/s3-credentials.test.ts
  git commit -m "feat: add workspace role validation and scoping to s3 credentials endpoints"
  ```

---

### Task 3: Backend S3 Auth Middleware Scoping

**Files:**
- Modify: `packages/worker/src/middleware/s3-auth.ts`
- Test: `packages/worker/tests/s3-auth.test.ts`

**Interfaces:**
- Consumes: Scoped credentials in database.
- Produces: Context variable `s3WorkspaceId` set in downstream routes.

- [ ] **Step 1: Write failing test verifying `s3WorkspaceId` in context**
  Update `packages/worker/tests/s3-auth.test.ts` to assert that context contains `s3WorkspaceId` after successful authorization.

- [ ] **Step 2: Run tests to verify failure**
  Run: `npx vitest run packages/worker/tests/s3-auth.test.ts`
  Expected: FAIL

- [ ] **Step 3: Modify middleware to set `s3WorkspaceId`**
  In `packages/worker/src/middleware/s3-auth.ts`:
  Modify the credential database query to select all fields:
  ```typescript
  const cred = await db.prepare('SELECT * FROM s3_credentials WHERE access_key_id = ?').bind(accessKeyId).first();
  ```
  And then set `s3WorkspaceId` context variable:
  ```typescript
  c.set('userId', cred.user_id);
  c.set('s3WorkspaceId', cred.workspace_id || null);
  ```

- [ ] **Step 4: Run tests to verify pass**
  Run: `npx vitest run packages/worker/tests/s3-auth.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add packages/worker/src/middleware/s3-auth.ts packages/worker/tests/s3-auth.test.ts
  git commit -m "feat: propagate s3WorkspaceId in S3 auth middleware context"
  ```

---

### Task 4: S3 Object Routing Scoping Enforcement

**Files:**
- Modify: `packages/worker/src/routes/s3.ts`
- Test: `packages/worker/tests/s3-api.test.ts`

**Interfaces:**
- Consumes: Context variable `s3WorkspaceId` from Task 3.
- Produces: Scoped routing and list operations.

- [ ] **Step 1: Write tests in `s3-api.test.ts` for scoping**
  Write tests in `packages/worker/tests/s3-api.test.ts` asserting:
  - If `s3WorkspaceId` is set, `GET /s3/` (List Buckets) only returns the scoped workspace.
  - If `s3WorkspaceId` is set, accessing objects inside any other workspace/bucket name returns `404/AccessDenied` error.

- [ ] **Step 2: Run tests to verify failure**
  Run: `npx vitest run packages/worker/tests/s3-api.test.ts`
  Expected: FAIL

- [ ] **Step 3: Update List Buckets endpoint**
  In `packages/worker/src/routes/s3.ts` (`s3Router.get('/', ...)`):
  Fetch `s3WorkspaceId` via `c.get('s3WorkspaceId')`. Update SQL query:
  ```sql
  SELECT w.id, w.name, w.created_at 
  FROM workspaces w
  JOIN workspace_members wm ON w.id = wm.workspace_id
  WHERE wm.user_id = ?
    AND (? IS NULL OR w.id = ?)
  ```
  Bind `userId`, `s3WorkspaceId`, `s3WorkspaceId`.

- [ ] **Step 4: Update all workspace resolution checks in `s3.ts`**
  Identify all queries resolving `workspace` from bucket name and user ID:
  ```sql
  SELECT w.id FROM workspaces w
  JOIN workspace_members wm ON w.id = wm.workspace_id
  WHERE w.name = ? AND wm.user_id = ?
  ```
  Update these queries to incorporate workspace scoping constraint:
  ```sql
  SELECT w.id FROM workspaces w
  JOIN workspace_members wm ON w.id = wm.workspace_id
  WHERE w.name = ? AND wm.user_id = ?
    AND (? IS NULL OR w.id = ?)
  ```
  Bind: `bucketName`, `userId`, `s3WorkspaceId`, `s3WorkspaceId`.
  Update this for `GET /:bucket`, `HEAD /:bucket/:key`, `GET /:bucket/:key`, `DELETE /:bucket/:key`, `PUT /:bucket/:key`, `POST /:bucket/:key`.

- [ ] **Step 5: Run S3 API tests to verify enforcement**
  Run: `npx vitest run packages/worker/tests/s3-api.test.ts`
  Expected: PASS

- [ ] **Step 6: Commit S3 router updates**
  Run:
  ```bash
  git add packages/worker/src/routes/s3.ts packages/worker/tests/s3-api.test.ts
  git commit -m "feat: enforce workspace scoping on S3 bucket and object actions"
  ```

---

### Task 5: Frontend API Client Additions

**Files:**
- Modify: `packages/web/src/lib/api.ts`

**Interfaces:**
- Consumes: Backend route endpoints.
- Produces: API methods `getWorkspaces()`, `getS3Credentials()`, `createS3Credential()`, and `deleteS3Credential()`.

- [ ] **Step 1: Map S3 credentials and workspace fetching methods**
  Add the following properties to the exported `api` object in `packages/web/src/lib/api.ts`:
  ```typescript
  getWorkspaces: () => request<{ workspaces: { id: string; name: string; role: string }[] }>('/api/workspaces'),
  getS3Credentials: () => request<any[]>('/api/s3-credentials'),
  createS3Credential: (description: string, workspaceId?: string) =>
    request<{ id: string; accessKeyId: string; secretAccessKey: string; description: string; createdAt: string }>('/api/s3-credentials', {
      method: 'POST',
      body: JSON.stringify({ description, workspaceId }),
    }),
  deleteS3Credential: (id: string) => request<{ success: boolean }>(`/api/s3-credentials/${id}`, { method: 'DELETE' }),
  ```

- [ ] **Step 2: Commit API changes**
  Run:
  ```bash
  git add packages/web/src/lib/api.ts
  git commit -m "feat: add S3 credentials and workspaces methods to api client"
  ```

---

### Task 6: Settings Dashboard S3 Key Management UI

**Files:**
- Modify: `packages/web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: API client functions from Task 5.
- Produces: Workspace-scoped & Global S3 API Keys table and key generation form in dashboard.

- [ ] **Step 1: Fetch workspaces and S3 credentials in page setup**
  Load credentials and workspaces list on mount. Filter the list of workspaces to only contain items where `role === 'manager' || role === 'owner'`.
  ```typescript
  const [s3Keys, setS3Keys] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  ```

- [ ] **Step 2: Render S3 Keys table**
  Display S3 API Keys section with list table containing columns: Description, Access Key ID, Scope (Global vs `Workspace: <workspace_name>`), Created At, Actions (Revoke Button).

- [ ] **Step 3: Render Create Key Form**
  Implement S3 Key creation UI inside `SettingsPage.tsx` showing text input for `description` and dropdown choice for `scope` (offering `Global (All Workspaces)` and list of workspaces matching management roles).

- [ ] **Step 4: Show generated key credentials**
  Once `createS3Credential` succeeds, render a success modal/box displaying both generated Access Key ID and Secret Access Key with copy-to-clipboard buttons and security prompt to copy it immediately.

- [ ] **Step 5: Verify build works**
  Run: `npm run build --prefix packages/web`
  Expected: Build succeeds without errors.

- [ ] **Step 6: Commit settings UI changes**
  Run:
  ```bash
  git add packages/web/src/pages/SettingsPage.tsx
  git commit -m "feat: add S3 credentials management section with workspace scoping to Settings Page"
  ```
