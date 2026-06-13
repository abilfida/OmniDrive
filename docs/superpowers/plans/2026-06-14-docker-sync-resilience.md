# Docker Sync Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement resume-able sync, OOM prevention via generator-based streaming, and graceful shutdown to ensure stability in single-container Docker deployments.

**Architecture:** We will modify `schema.sql` to include `next_page_token`, add a D1 migration and graceful shutdown in `node-server.ts`, create an async generator `iterateAllFilesAndFolders` in `GoogleDriveService`, and update `sync.ts` to process pages chunk-by-chunk using D1 transactions with an in-memory lock to prevent cron overlap.

**Tech Stack:** Node.js, SQLite (better-sqlite3 via D1 wrapper), @hono/node-server

---

### Task 1: Update Database Schema

**Files:**
- Modify: `packages/worker/src/db/schema.sql:106-113`

- [ ] **Step 1: Modify schema.sql**

Modify `packages/worker/src/db/schema.sql` to add `next_page_token` to the `sync_state` table.

```sql
-- Sync state tracking per drive account
CREATE TABLE IF NOT EXISTS sync_state (
    drive_account_id TEXT PRIMARY KEY REFERENCES drive_accounts(id) ON DELETE CASCADE,
    change_token     TEXT,
    next_page_token  TEXT,
    last_synced_at   TEXT,
    status           TEXT DEFAULT 'idle',
    error_message    TEXT
);
```

- [ ] **Step 2: Commit**

```bash
git add packages/worker/src/db/schema.sql
git commit -m "feat: add next_page_token to sync_state schema"
```

### Task 2: Node Server Migration & Graceful Shutdown

**Files:**
- Modify: `packages/worker/src/node-server.ts:20-30`
- Modify: `packages/worker/src/node-server.ts:77-85`

- [ ] **Step 1: Add DB migration and startup cleanup**

In `packages/worker/src/node-server.ts`, right after initializing the DB, add an ALTER TABLE for existing databases and clean up stuck states.

```typescript
if (isNewDb) {
  const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    d1.exec(fs.readFileSync(schemaPath, 'utf-8'));
    console.log('Database schema initialized.');
  }
} else {
  // Migration for existing DB
  try {
    d1.exec("ALTER TABLE sync_state ADD COLUMN next_page_token TEXT;");
  } catch (e) {
    // Ignore if column already exists
  }
}

// Startup cleanup: reset stuck syncing states
d1.exec("UPDATE sync_state SET status = 'error', error_message = 'Sync interrupted by server restart' WHERE status = 'syncing'");
```

- [ ] **Step 2: Add graceful shutdown hooks**

In `packages/worker/src/node-server.ts`, update the server launch code to handle `SIGTERM`. Also, we will import `setShuttingDown` from `sync.ts` (which we will create soon, but we can import it now).

Add this at the top of the file:
```typescript
import { setShuttingDown } from './services/sync';
```

And update the bottom of the file where `serve` is called:

```typescript
const port = parseInt(process.env.PORT || '8080', 10);
console.log(`Starting Node server on port ${port}...`);

const server = serve({
  fetch: (req) => app.fetch(req, nodeEnv, dummyCtx),
  port
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Initiating graceful shutdown...');
  setShuttingDown();
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Initiating graceful shutdown...');
  setShuttingDown();
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
});
```

- [ ] **Step 3: Export setShuttingDown in sync.ts to fix imports**

Add this to the top of `packages/worker/src/services/sync.ts` so `node-server.ts` compiles:

```typescript
export let isShuttingDown = false;

export function setShuttingDown(): void {
  isShuttingDown = true;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/worker/src/node-server.ts packages/worker/src/services/sync.ts
git commit -m "feat: add startup db cleanup and graceful shutdown"
```

### Task 3: Async Generator in GoogleDriveService

**Files:**
- Create: `packages/worker/src/tests/google-drive.test.ts`
- Modify: `packages/worker/src/services/google-drive.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/worker/src/tests/google-drive.test.ts`:

```typescript
import { test, expect, vi } from 'vitest';
import { GoogleDriveService } from '../services/google-drive';

test('iterateAllFilesAndFolders yields chunks of data', async () => {
  const kv = { get: vi.fn(), put: vi.fn() } as any;
  const service = new GoogleDriveService(kv, 'client_id', 'secret');
  service.getValidToken = vi.fn().mockResolvedValue('token');

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      files: [{ id: '1', mimeType: 'application/vnd.google-apps.folder' }],
      nextPageToken: undefined
    })
  });

  const iterator = service.iterateAllFilesAndFolders('drive_1', 'token123');
  const result = await iterator.next();
  
  expect(result.done).toBe(false);
  expect(result.value.folders).toHaveLength(1);
  expect(result.value.nextPageToken).toBeUndefined();
  
  const end = await iterator.next();
  expect(end.done).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace=@omnidrive/worker run test -- packages/worker/src/tests/google-drive.test.ts`
Expected: FAIL because `iterateAllFilesAndFolders` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `packages/worker/src/services/google-drive.ts`, add the new generator method to the `GoogleDriveService` class (around line 618):

```typescript
  async *iterateAllFilesAndFolders(
    driveAccountId: string,
    startPageToken?: string
  ): AsyncGenerator<{ files: GDriveFile[]; folders: GDriveFolder[]; nextPageToken?: string }, void, unknown> {
    const token = await this.getValidToken(driveAccountId);
    const fields =
      'nextPageToken,files(id,name,mimeType,size,parents,trashed,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime)';
    const q = encodeURIComponent(`trashed = false`);

    let pageToken: string | undefined = startPageToken;

    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,${fields}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to list folder contents: ${await response.text()}`);
      }

      const data: { files: GDriveFile[]; nextPageToken?: string } = await response.json();

      const chunkFiles: GDriveFile[] = [];
      const chunkFolders: GDriveFolder[] = [];

      for (const item of data.files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          chunkFolders.push({ id: item.id, name: item.name, parents: item.parents });
        } else if (item.mimeType !== 'application/vnd.google-apps.shortcut') {
          chunkFiles.push(item);
        }
      }

      yield { files: chunkFiles, folders: chunkFolders, nextPageToken: data.nextPageToken };
      
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace=@omnidrive/worker run test -- packages/worker/src/tests/google-drive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/tests/google-drive.test.ts packages/worker/src/services/google-drive.ts
git commit -m "feat: add generator based iterateAllFilesAndFolders to GoogleDriveService"
```

### Task 4: Sync Engine Lock & Chunk Processing

**Files:**
- Create: `packages/worker/src/tests/sync.test.ts`
- Modify: `packages/worker/src/services/sync.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/worker/src/tests/sync.test.ts`:

```typescript
import { test, expect } from 'vitest';
import { activeSyncs } from '../services/sync';

test('activeSyncs lock exists', () => {
  expect(activeSyncs).toBeInstanceOf(Set);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace=@omnidrive/worker run test -- packages/worker/src/tests/sync.test.ts`
Expected: FAIL because `activeSyncs` is undefined.

- [ ] **Step 3: Write implementation**

In `packages/worker/src/services/sync.ts`, export `activeSyncs` at the top:

```typescript
export const activeSyncs = new Set<string>();
```

Then update `syncDriveAccount` to use the `next_page_token` checkpoint:

```typescript
    const syncState = await db
      .prepare('SELECT * FROM sync_state WHERE drive_account_id = ?')
      .bind(drive.id)
      .first<{ change_token: string | null; next_page_token: string | null }>();

    let changeToken = syncState?.change_token;
    let nextPageToken = syncState?.next_page_token;

    if (!changeToken) {
      await performInitialSync(drive, db, driveService, nextPageToken ?? undefined);
      changeToken = await driveService.getStartPageToken(drive.id);
    } else {
      changeToken = await performIncrementalSync(drive, db, changeToken, driveService);
    }

    await db
      .prepare(
        "INSERT INTO sync_state (drive_account_id, status, last_synced_at, change_token, next_page_token) VALUES (?, 'idle', CURRENT_TIMESTAMP, ?, NULL) ON CONFLICT(drive_account_id) DO UPDATE SET status = 'idle', last_synced_at = CURRENT_TIMESTAMP, change_token = excluded.change_token, next_page_token = NULL"
      )
      .bind(drive.id, changeToken)
      .run();
```

Replace the old `performInitialSync` function with the generator version:

```typescript
async function performInitialSync(
  drive: DriveAccount,
  db: D1Database,
  driveService: GoogleDriveService,
  startPageToken?: string
): Promise<void> {
  console.log(`Initial sync for ${drive.email} — chunk processing`);

  const rootFolderId = await driveService.getRootFolderId(drive.id);
  const iterator = driveService.iterateAllFilesAndFolders(drive.id, startPageToken);

  for await (const chunk of iterator) {
    if (isShuttingDown) {
      console.log(`Sync interrupted by shutdown for ${drive.email}. State saved.`);
      break;
    }

    // Process chunk iteratively to avoid D1 limits, though they share the same JS event loop block.
    for (const folder of chunk.folders) {
      let parentId = folder.parents?.[0] ?? null;
      if (parentId === rootFolderId) parentId = null;
      await upsertDriveFolder(db, drive, folder, parentId);
    }

    for (const file of chunk.files) {
      let parentId = file.parents?.[0] ?? 'root';
      if (parentId === rootFolderId) parentId = 'root';
      await upsertFile(db, drive, file, parentId);
    }

    // Save checkpoint
    if (chunk.nextPageToken) {
      await db
        .prepare('UPDATE sync_state SET next_page_token = ? WHERE drive_account_id = ?')
        .bind(chunk.nextPageToken, drive.id)
        .run();
    }
  }
}
```

Update `runScheduledSync` to use the concurrency lock:

```typescript
export async function runScheduledSync(env: {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}): Promise<void> {
  if (isShuttingDown) return;

  const driveService = new GoogleDriveService(env.KV, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.TOKEN_ENCRYPTION_KEY);

  const rows = await env.DB.prepare("SELECT * FROM drive_accounts WHERE type = 'oauth'").all();
  const driveAccounts = (rows.results ?? []).map(mapDriveRow);

  console.log(`Syncing ${driveAccounts.length} drive accounts`);

  await Promise.allSettled(
    driveAccounts.map(async (drive) => {
      if (activeSyncs.has(drive.id)) {
        console.log(`Skipping sync for ${drive.email} as it is already syncing.`);
        return;
      }

      activeSyncs.add(drive.id);
      try {
        await syncDriveAccount(drive, env.DB, env.KV, driveService);
      } catch (err) {
        console.error(`Sync error for ${drive.email}:`, err);
      } finally {
        activeSyncs.delete(drive.id);
      }
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace=@omnidrive/worker run test -- packages/worker/src/tests/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/tests/sync.test.ts packages/worker/src/services/sync.ts
git commit -m "feat: implement chunked initial sync, checkpointing, and lock"
```
