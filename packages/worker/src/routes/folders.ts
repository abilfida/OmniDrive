import { Hono } from 'hono';
import type { AppContext, Env } from '../types/env';
import { authGuard } from '../middleware/auth-guard';
import { AppError } from '../middleware/error-handler';
import { generateId } from '../lib/id';
import { mapFileRow, type BreadcrumbItem } from '../types';
import { syncDriveAccount } from '../services/sync';
import { GoogleDriveService } from '../services/google-drive';
import { mapDriveRow } from '../types/index';
import { encodeCursor, decodeCursor } from '../lib/cursor';
import { syncDriveFolder } from '../services/sync';
import { getWorkspaceRole, hasPermission } from '../middleware/rbac';

type WorkspaceRole = Parameters<typeof hasPermission>[1];

// Ids on this router name either a workspace (its root) or a folder inside one.
// Resolves which, and enforces the caller's role in that workspace. Non-members
// get 404 so ids of other workspaces can't be probed.
async function authorizeTarget(
  db: D1Database,
  userId: string,
  id: string,
  required: WorkspaceRole
): Promise<{ workspaceId: string; folderId: string | null }> {
  let workspaceId: string;
  let folderId: string | null = null;
  const ws = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(id).first<{ id: string }>();
  if (ws) {
    workspaceId = ws.id;
  } else {
    const folder = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(id).first<{ workspace_id: string }>();
    if (!folder) throw new AppError(404, 'Folder not found');
    workspaceId = folder.workspace_id;
    folderId = id;
  }

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role) throw new AppError(404, 'Folder not found');
  if (!hasPermission(role, required)) throw new AppError(403, `${required} access to this workspace is required`);
  return { workspaceId, folderId };
}

export const foldersRouter = new Hono<AppContext>({ strict: false });

foldersRouter.use('*', authGuard);

async function performBackgroundSync(env: Env, folderId: string, driveId: string | null, userId: string) {
  const db = env.DB;
  try {
    await db.prepare("UPDATE workspace_folders SET sync_status = 'syncing' WHERE id = ?").bind(folderId).run();
    if (driveId) {
      await syncDriveFolder(env, driveId, folderId, userId);
    }
    await db.prepare("UPDATE workspace_folders SET sync_status = 'idle', last_synced_at = datetime('now') WHERE id = ?").bind(folderId).run();
  } catch (err) {
    console.error('Background sync error:', err);
    await db.prepare("UPDATE workspace_folders SET sync_status = 'error' WHERE id = ?").bind(folderId).run();
  }
}


foldersRouter.get('/tree', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  
  const { results: workspaces } = await db.prepare(`
    SELECT w.id, w.name, w.created_at, w.updated_at
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ? ORDER BY w.name ASC
  `).bind(userId).all();
  
  const rootFolders = workspaces.map((w: any) => ({
    id: w.id, workspaceId: w.id, name: w.name, parentId: null, icon: '🏢', color: '#4A90D9', isStarred: false, createdAt: w.created_at, updatedAt: w.updated_at
  }));
  
  const { results: folders } = await db.prepare(`
    SELECT f.* 
    FROM workspace_folders f
    JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE wm.user_id = ? ORDER BY f.name ASC
  `).bind(userId).all();
  
  const subFolders = folders.map((f: any) => ({
    id: f.id, workspaceId: f.workspace_id, name: f.name, parentId: f.parent_id || f.workspace_id, icon: f.icon || '📁', color: f.color || '#4A90D9', isStarred: !!f.is_starred, metadata: f.metadata, createdAt: f.created_at, updatedAt: f.updated_at
  }));
  
  return c.json({ folders: [...rootFolders, ...subFolders] });
});

foldersRouter.get('/:id?', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id') || null;
  const db = c.env.DB;

  const cursorParam = c.req.query('cursor');
  const parsed = parseInt(c.req.query('limit') || '50', 10);
  const limit = isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 100);
  const cursor = cursorParam ? decodeCursor<{ name: string, id: string }>(cursorParam) : null;
  let hasMore = false;
  let nextCursor: string | null = null;

  let currentFolder = null;
  let subfolders: any[] = [];
  let files: any[] = [];
  let breadcrumb: BreadcrumbItem[] = [];

  if (folderId) await authorizeTarget(db, userId, folderId, 'viewer');

  if (!folderId) {
    const { results: workspaces } = await db.prepare(`
      SELECT w.id, w.name, w.created_at, w.updated_at
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ? ORDER BY w.name ASC
    `).bind(userId).all();
    
    subfolders = workspaces.map((w: any) => ({
      id: w.id, workspaceId: w.id, name: w.name, parentId: null, icon: '🏢', color: '#4A90D9', isStarred: false, createdAt: w.created_at, updatedAt: w.updated_at
    }));
  } else {
    const ws = await db.prepare(`
      SELECT w.* FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.id = ? AND wm.user_id = ?
    `).bind(folderId, userId).first();

    if (ws) {
      currentFolder = { id: ws.id, workspaceId: ws.id, name: ws.name, parentId: null, icon: '🏢', color: '#4A90D9', isStarred: false, createdAt: ws.created_at as string, updatedAt: ws.updated_at as string, lastSyncedAt: null as string | null, syncStatus: 'idle' as string | null };
      
      const { results: subRows } = await db.prepare('SELECT * FROM workspace_folders WHERE workspace_id = ? AND parent_id IS NULL ORDER BY name ASC').bind(folderId).all();
      subfolders = subRows.map((f: any) => ({ id: f.id, workspaceId: f.workspace_id, name: f.name, parentId: folderId, icon: f.icon || '📁', color: f.color || '#4A90D9', isStarred: !!f.is_starred, metadata: f.metadata, createdAt: f.created_at, updatedAt: f.updated_at }));

      let sql = `
        SELECT f.*, d.email as driveEmail 
        FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE f.workspace_id = ? AND f.workspace_folder_id IS NULL AND f.is_trashed = 0
      `;
      const binds: any[] = [folderId];

      if (cursor && cursor.name !== undefined && cursor.id !== undefined) {
        sql += ` AND (f.name, f.id) > (?, ?)`;
        binds.push(cursor.name, cursor.id);
      }

      sql += ` ORDER BY f.name ASC, f.id ASC LIMIT ?`;
      binds.push(limit + 1);

      const { results: fileRows } = await db.prepare(sql).bind(...binds).all();

      if (fileRows.length > limit) {
        hasMore = true;
        fileRows.pop();
      }

      files = fileRows.map((r: any) => ({ ...mapFileRow(r), driveEmail: r.driveEmail }));
      if (files.length > 0 && hasMore) {
        const lastFile = files[files.length - 1];
        nextCursor = encodeCursor({ name: lastFile.name, id: lastFile.id });
      }
      
      breadcrumb = [{ id: null, name: 'Home' }, { id: ws.id as string, name: ws.name as string }];
    } else {
      const folder = await db.prepare('SELECT f.*, w.name as ws_name FROM workspace_folders f JOIN workspaces w ON f.workspace_id = w.id WHERE f.id = ?').bind(folderId).first();
      if (!folder) throw new AppError(404, 'Folder not found');
      
      currentFolder = { id: folder.id, workspaceId: folder.workspace_id, name: folder.name, parentId: folder.parent_id || folder.workspace_id, icon: folder.icon || '📁', color: folder.color || '#4A90D9', isStarred: !!folder.is_starred, metadata: folder.metadata, createdAt: folder.created_at as string, updatedAt: folder.updated_at as string, lastSyncedAt: folder.last_synced_at as string | null, syncStatus: folder.sync_status as string | null };
      
      const { results: subRows } = await db.prepare('SELECT * FROM workspace_folders WHERE parent_id = ? ORDER BY name ASC').bind(folderId).all();
      subfolders = subRows.map((f: any) => ({ id: f.id, workspaceId: f.workspace_id, name: f.name, parentId: folderId, icon: f.icon || '📁', color: f.color || '#4A90D9', isStarred: !!f.is_starred, metadata: f.metadata, createdAt: f.created_at, updatedAt: f.updated_at }));

      let sql = `
        SELECT f.*, d.email as driveEmail 
        FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE f.workspace_folder_id = ? AND f.is_trashed = 0
      `;
      const binds: any[] = [folderId];

      if (cursor && cursor.name !== undefined && cursor.id !== undefined) {
        sql += ` AND (f.name, f.id) > (?, ?)`;
        binds.push(cursor.name, cursor.id);
      }

      sql += ` ORDER BY f.name ASC, f.id ASC LIMIT ?`;
      binds.push(limit + 1);

      const { results: fileRows } = await db.prepare(sql).bind(...binds).all();

      if (fileRows.length > limit) {
        hasMore = true;
        fileRows.pop();
      }

      files = fileRows.map((r: any) => ({ ...mapFileRow(r), driveEmail: r.driveEmail }));
      if (files.length > 0 && hasMore) {
        const lastFile = files[files.length - 1];
        nextCursor = encodeCursor({ name: lastFile.name, id: lastFile.id });
      }

      breadcrumb = [{ id: null, name: 'Home' }, { id: folder.workspace_id as string, name: folder.ws_name as string }, { id: folder.id as string, name: folder.name as string }];
    }
  }

  if (currentFolder && currentFolder.id !== currentFolder.workspaceId) {
    const ws = await db.prepare('SELECT sync_ttl_minutes FROM workspaces WHERE id = ?').bind(currentFolder.workspaceId).first<{sync_ttl_minutes: number}>();
    const ttlMinutes = ws?.sync_ttl_minutes || 5;
    
    let isExpired = true;
    if (currentFolder.lastSyncedAt) {
      const lastSynced = new Date(currentFolder.lastSyncedAt).getTime();
      const now = Date.now();
      isExpired = (now - lastSynced) > (ttlMinutes * 60 * 1000);
    }
    
    let driveId = c.req.query('driveId') || null;
    if (!driveId) {
      const { results } = await db.prepare(`
        SELECT DISTINCT d.id 
        FROM files f 
        JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ? LIMIT 1
      `).bind(currentFolder.id, currentFolder.id, userId).all<{ id: string }>();
      if (results && results.length > 0) {
        driveId = results[0].id;
      }
    }
    
    if (isExpired && currentFolder.syncStatus !== 'syncing') {
      c.executionCtx.waitUntil(performBackgroundSync(c.env, currentFolder.id as string, driveId, userId as string));
    }
  }


  return c.json({ folder: currentFolder, subfolders, files, breadcrumb, pagination: { nextCursor, hasMore } });
});

foldersRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { name, parentId, icon, color } = body;
  const db = c.env.DB;

  if (!name) throw new AppError(400, 'Folder name is required');

  if (!parentId) {
    const workspaceId = generateId();
    const memberId = generateId();
    await db.batch([
      db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').bind(workspaceId, name, userId),
      db.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, workspaceId, userId, 'owner')
    ]);
    return c.json({ id: workspaceId, name, parentId: null });
  }

  const { workspaceId, folderId: actualParentId } = await authorizeTarget(db, userId, parentId, 'editor');

  const id = generateId();
  await db.prepare('INSERT INTO workspace_folders (id, workspace_id, name, parent_id, icon, color) VALUES (?, ?, ?, ?, ?, ?)').bind(id, workspaceId, name, actualParentId, icon || '📁', color || '#4A90D9').run();
  
  return c.json({ id, name, parentId });
});

foldersRouter.put('/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const body = await c.req.json();
  const { name, parentId, icon, color } = body;
  const db = c.env.DB;

  const target = await authorizeTarget(db, userId, folderId, 'editor');
  if (!target.folderId) {
    // Renaming a workspace also renames its S3 bucket, so it needs manager access.
    await authorizeTarget(db, userId, folderId, 'manager');
    if (name) await db.prepare('UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, folderId).run();
    return c.json({ success: true });
  }

  const updateFields: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updateFields.push('name = ?');
    params.push(name);
  }
  if (icon !== undefined) {
    updateFields.push('icon = ?');
    params.push(icon);
  }
  if (color !== undefined) {
    updateFields.push('color = ?');
    params.push(color);
  }
  if (parentId !== undefined) {
    const parent = await authorizeTarget(db, userId, parentId, 'editor');
    if (parent.workspaceId !== target.workspaceId) {
      throw new AppError(400, 'Folders can only be moved within their workspace');
    }
    if (parent.folderId) {
      // Reject moving a folder into itself or one of its descendants (a detached cycle).
      const cycle = await db.prepare(`
        WITH RECURSIVE ancestors(id) AS (
          SELECT ? UNION ALL
          SELECT f.parent_id FROM workspace_folders f JOIN ancestors a ON f.id = a.id WHERE f.parent_id IS NOT NULL
        )
        SELECT 1 FROM ancestors WHERE id = ? LIMIT 1
      `).bind(parent.folderId, folderId).first();
      if (cycle) throw new AppError(400, 'A folder cannot be moved into itself or its subfolders');
    }
    updateFields.push('parent_id = ?');
    params.push(parent.folderId);
  }

  if (updateFields.length > 0) {
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(folderId);
    await db.prepare(`UPDATE workspace_folders SET ${updateFields.join(', ')} WHERE id = ?`).bind(...params).run();
  }
  
  return c.json({ success: true });
});

foldersRouter.post('/:id/star', async (c) => {
  const folderId = c.req.param('id');
  await authorizeTarget(c.env.DB, c.get('userId'), folderId, 'editor');
  await c.env.DB.prepare('UPDATE workspace_folders SET is_starred = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(folderId).run();
  return c.json({ success: true });
});

foldersRouter.post('/:id/unstar', async (c) => {
  const folderId = c.req.param('id');
  await authorizeTarget(c.env.DB, c.get('userId'), folderId, 'editor');
  await c.env.DB.prepare('UPDATE workspace_folders SET is_starred = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(folderId).run();
  return c.json({ success: true });
});

foldersRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const db = c.env.DB;

  const target = await authorizeTarget(db, userId, folderId, 'editor');
  if (!target.folderId) {
    await authorizeTarget(db, userId, folderId, 'owner');
    await db.prepare('DELETE FROM workspaces WHERE id = ?').bind(folderId).run();
    return c.json({ success: true });
  }

  await db.prepare('DELETE FROM workspace_folders WHERE id = ?').bind(folderId).run();
  return c.json({ success: true });
});

foldersRouter.post('/:id/files', async (c) => {
  const folderId = c.req.param('id');
  const userId = c.get('userId');
  const db = c.env.DB;
  const { fileIds } = await c.req.json<{ fileIds: string[] }>();
  
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) return c.json({ success: true });
  
  const { workspaceId, folderId: workspaceFolderId } = await authorizeTarget(db, userId, folderId, 'editor');

  const CHUNK_SIZE = 50;
  for (let i = 0; i < fileIds.length; i += CHUNK_SIZE) {
    const chunk = fileIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const query = `UPDATE files SET workspace_id = ?, workspace_folder_id = ?, updated_at = datetime('now') WHERE user_id = ? AND id IN (${placeholders})`;
    await db.prepare(query).bind(workspaceId, workspaceFolderId, userId, ...chunk).run();
  }
  
  return c.json({ success: true });
});

foldersRouter.post('/:id/sync', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const db = c.env.DB;
  await authorizeTarget(db, userId, folderId, 'viewer');
  
  const { results } = await db.prepare(`
    SELECT DISTINCT d.* 
    FROM files f 
    JOIN drive_accounts d ON f.drive_account_id = d.id 
    WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ?
  `).bind(folderId, folderId, userId).all();
  
  if (results && results.length > 0) {
    const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
    for (const row of results) {
       const drive = mapDriveRow(row as any);
       c.executionCtx.waitUntil(syncDriveAccount(drive, db, c.env.KV, driveService).catch(console.error));
    }
  }
  
  return c.json({ success: true });
});

foldersRouter.post('/:id/force-sync', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  let driveId = c.req.query('driveId') || null;
  const db = c.env.DB;

  await authorizeTarget(db, userId, folderId, 'editor');
  if (driveId) {
    const ownDrive = await db.prepare('SELECT id FROM drive_accounts WHERE id = ? AND user_id = ?').bind(driveId, userId).first();
    if (!ownDrive) throw new AppError(404, 'Drive account not found');
  }

  if (!driveId) {
    // Look up via files table if not passed directly
    const { results } = await db.prepare(`
      SELECT DISTINCT d.id 
      FROM files f 
      JOIN drive_accounts d ON f.drive_account_id = d.id 
      WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ? LIMIT 1
    `).bind(folderId, folderId, userId).all<{ id: string }>();
    if (results && results.length > 0) {
      driveId = results[0].id;
    }
  }

  if (!driveId) {
    // If still not found, try to look up the user's primary drive or any drive
    const { results } = await db.prepare(`
      SELECT id FROM drive_accounts WHERE user_id = ? ORDER BY is_primary DESC LIMIT 1
    `).bind(userId).all<{ id: string }>();
    if (results && results.length > 0) {
      driveId = results[0].id;
    }
  }

  if (!driveId) {
    throw new AppError(400, 'driveId is required or could not be determined');
  }

  c.executionCtx.waitUntil(performBackgroundSync(c.env, folderId, driveId, userId));
  
  return c.json({ success: true });
});
