# Caching, Lazy Loading, and Rate-Limit Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement TTL-based database caching, stale-while-revalidate background sync, lazy loading on hover, and manual sync controls to minimize API rate limits and maximize responsiveness.

**Architecture:** 
- Add `sync_ttl_minutes` to `workspaces` and `last_synced_at`, `sync_status` to `workspace_folders`/`files`.
- Backend uses `ctx.waitUntil()` to silently refresh expired cache without blocking the frontend response.
- Frontend uses prefetching on hover and a dedicated View Info panel sync button for manual overrides.

**Tech Stack:** React, TypeScript, Cloudflare Workers, Hono, D1 Database.

---

### Task 1: Database Schema & Types

**Files:**
- Create: `packages/worker/scripts/add_sync_cache_columns.sql`
- Modify: `packages/worker/src/types/index.ts`
- Modify: `packages/web/src/types/index.ts`

- [ ] **Step 1: Write the SQL migration script**

Create `packages/worker/scripts/add_sync_cache_columns.sql` with:
```sql
ALTER TABLE workspaces ADD COLUMN sync_ttl_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE workspace_folders ADD COLUMN last_synced_at TEXT;
ALTER TABLE workspace_folders ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE files ADD COLUMN last_synced_at TEXT;
ALTER TABLE files ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
```

- [ ] **Step 2: Update Backend Types**

Modify `packages/worker/src/types/index.ts` to include the new fields in `WorkspaceRow`, `WorkspaceFolderRow`, and `FileRow`.

```typescript
export interface WorkspaceRow {
  // ... existing fields
  sync_ttl_minutes: number;
}

export interface WorkspaceFolderRow {
  // ... existing fields
  last_synced_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
}

export interface FileRow {
  // ... existing fields
  last_synced_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
}
```

- [ ] **Step 3: Update Frontend Types**

Modify `packages/web/src/types/index.ts` identically for `Workspace`, `WorkspaceFolder`, and `FileEntry`.

```typescript
export interface Workspace {
  // ... existing fields
  syncTtlMinutes: number;
}

export interface WorkspaceFolder {
  // ... existing fields
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
}

export interface FileEntry {
  // ... existing fields
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
}
```

- [ ] **Step 4: Execute the SQL script on the test database**

Run: `npx wrangler d1 execute omnidrive --local --file=packages/worker/scripts/add_sync_cache_columns.sql`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/worker/scripts/add_sync_cache_columns.sql packages/worker/src/types/index.ts packages/web/src/types/index.ts
git commit -m "feat: add sync tracking columns and update types"
```

### Task 2: Backend - Stale-While-Revalidate Navigation

**Files:**
- Modify: `packages/worker/src/routes/folders.ts`

- [ ] **Step 1: Extract sync logic to a background function**

In `packages/worker/src/routes/folders.ts`, add a helper function `performBackgroundSync` that checks the TTL, locks the status, calls `syncDriveFolder` (from `services/sync.ts`), and unlocks it.

```typescript
import { syncDriveFolder } from '../services/sync';

async function performBackgroundSync(env: any, folderId: string, driveId: string | null, userId: string) {
  const db = env.DB;
  try {
    // Lock
    await db.prepare("UPDATE workspace_folders SET sync_status = 'syncing' WHERE id = ?").bind(folderId).run();
    // Run sync if driveId is available
    if (driveId) {
      await syncDriveFolder(env, driveId, folderId, userId);
    }
    // Unlock and update timestamp
    await db.prepare("UPDATE workspace_folders SET sync_status = 'idle', last_synced_at = datetime('now') WHERE id = ?").bind(folderId).run();
  } catch (err) {
    // On error
    await db.prepare("UPDATE workspace_folders SET sync_status = 'error' WHERE id = ?").bind(folderId).run();
  }
}
```

- [ ] **Step 2: Integrate `ctx.waitUntil` in `GET /:id?`**

Modify the `GET /:id?` handler in `folders.ts`. After fetching `currentFolder`, calculate if `last_synced_at` is older than `sync_ttl_minutes`.

```typescript
  // Inside GET /:id? after fetching currentFolder
  if (currentFolder && currentFolder.id !== currentFolder.workspaceId) {
    const ws = await db.prepare('SELECT sync_ttl_minutes FROM workspaces WHERE id = ?').bind(currentFolder.workspaceId).first();
    const ttlMinutes = ws?.sync_ttl_minutes || 5;
    
    let isExpired = true;
    if (currentFolder.lastSyncedAt) {
      const lastSynced = new Date(currentFolder.lastSyncedAt).getTime();
      const now = Date.now();
      isExpired = (now - lastSynced) > (ttlMinutes * 60 * 1000);
    }
    
    const driveId = c.req.query('driveId') || null; // Assume passed in query
    
    if (isExpired && folder.sync_status !== 'syncing') {
      c.executionCtx.waitUntil(performBackgroundSync(c.env, currentFolder.id, driveId, userId));
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add packages/worker/src/routes/folders.ts
git commit -m "feat: implement stale-while-revalidate for folders"
```

### Task 3: Frontend - Hook Updates and Hover Prefetching

**Files:**
- Modify: `packages/web/src/hooks/useMergedDrive.ts`
- Modify: `packages/web/src/components/files/FileGrid.tsx`

- [ ] **Step 1: Update `useMergedDrive` to use caching endpoint**

In `packages/web/src/hooks/useMergedDrive.ts`, remove the call to `api.syncDriveFolder` and replace it with `api.getFolderContents` passing the `driveId` in the query so the backend can use it for the background sync.

```typescript
// Replace:
// const data = await api.syncDriveFolder(driveIdParam, folderId);
// With:
const data = await api.getFolderContents(folderId, undefined, undefined, driveIdParam); 
// Note: update api.getFolderContents signature to accept driveId if necessary
```

- [ ] **Step 2: Implement Prefetch on Hover in FileGrid**

In `packages/web/src/components/files/FileGrid.tsx`, attach an `onMouseEnter` event to the folder/file items.

```typescript
  const handlePrefetch = (id: string, driveId?: string) => {
    // Fire and forget
    api.getFolderContents(id, undefined, undefined, driveId).catch(() => {});
  };

  // On folder item render:
  <div onMouseEnter={() => handlePrefetch(folder.id, getDriveInfo(folder.driveAccountId).drive?.id)}>...</div>
```

- [ ] **Step 3: Enable Lazy Loading for images**

In `FileGrid.tsx`, ensure any thumbnail `<img>` tags have `loading="lazy"`.

```tsx
<img src={thumbnailUrl} loading="lazy" alt="preview" />
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/useMergedDrive.ts packages/web/src/components/files/FileGrid.tsx
git commit -m "feat: utilize stale-while-revalidate hook and implement hover prefetch"
```

### Task 4: View Info Panel & Manual Sync

**Files:**
- Modify: `packages/worker/src/routes/folders.ts`
- Modify: `packages/web/src/lib/api.ts`
- Modify: `packages/web/src/components/layout/InfoPanel.tsx`

- [ ] **Step 1: Add backend endpoint for Force Sync**

In `packages/worker/src/routes/folders.ts`, add a `POST /:id/sync` endpoint that ignores TTL.

```typescript
foldersRouter.post('/:id/sync', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const driveId = c.req.query('driveId');
  if (!driveId) throw new AppError(400, 'driveId is required');
  
  await performBackgroundSync(c.env, folderId, driveId, userId);
  return c.json({ success: true });
});
```

- [ ] **Step 2: Add API method**

In `packages/web/src/lib/api.ts`:

```typescript
  forceSyncFolder: (id: string, driveId: string) => 
    request<{ success: boolean }>(`/api/folders/${id}/sync?driveId=${driveId}`, { method: 'POST' }),
```

- [ ] **Step 3: Update InfoPanel UI**

In `packages/web/src/components/layout/InfoPanel.tsx`, add the "Last Synced" text and "Force Sync" button with loading state.

```tsx
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { useToastStore } from '../../stores/toastStore';

// Inside InfoPanel component
const [isSyncing, setIsSyncing] = useState(false);
const { addToast } = useToastStore();

const handleForceSync = async () => {
  if (!selectedItem || selectedItem.type !== 'folder') return;
  setIsSyncing(true);
  try {
    // Assuming driveId is accessible
    await api.forceSyncFolder(selectedItem.item.id, driveId);
    addToast('success', 'Sync complete');
    // Trigger refresh callback if available
  } catch (err) {
    addToast('error', 'Force sync failed');
  } finally {
    setIsSyncing(false);
  }
};

// In render:
<div className="mt-4">
  <p className="text-sm text-gray-500">
    Last synced: {selectedItem.item.lastSyncedAt ? new Date(selectedItem.item.lastSyncedAt).toLocaleString() : 'Never'}
  </p>
  <button 
    onClick={handleForceSync}
    disabled={isSyncing}
    className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"
  >
    <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
    {isSyncing ? 'Syncing...' : 'Force Sync'}
  </button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add packages/worker/src/routes/folders.ts packages/web/src/lib/api.ts packages/web/src/components/layout/InfoPanel.tsx
git commit -m "feat: add manual sync button and last synced info to InfoPanel"
```

---
