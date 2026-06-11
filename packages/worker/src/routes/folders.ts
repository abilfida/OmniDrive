import { Hono } from 'hono';
import type { AppContext } from '../types/env';
import { authGuard } from '../middleware/auth-guard';
import { AppError } from '../middleware/error-handler';
import { generateId } from '../lib/id';
import { mapFileRow, type BreadcrumbItem } from '../types';
import { syncDriveAccount } from '../services/sync';
import { GoogleDriveService } from '../services/google-drive';
import { mapDriveRow } from '../types/index';
import { encodeCursor, decodeCursor } from '../lib/cursor';

export const foldersRouter = new Hono<AppContext>({ strict: false });

foldersRouter.use('*', authGuard);

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
      currentFolder = { id: ws.id, workspaceId: ws.id, name: ws.name, parentId: null, icon: '🏢', color: '#4A90D9', isStarred: false, createdAt: ws.created_at as string, updatedAt: ws.updated_at as string };
      
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
      
      currentFolder = { id: folder.id, workspaceId: folder.workspace_id, name: folder.name, parentId: folder.parent_id || folder.workspace_id, icon: folder.icon || '📁', color: folder.color || '#4A90D9', isStarred: !!folder.is_starred, metadata: folder.metadata, createdAt: folder.created_at as string, updatedAt: folder.updated_at as string };
      
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

  const ws = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(parentId).first();
  let workspaceId = parentId;
  let actualParentId = null;

  if (!ws) {
    const folder = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(parentId).first<{ workspace_id: string }>();
    if (!folder) throw new AppError(404, 'Parent not found');
    workspaceId = folder.workspace_id;
    actualParentId = parentId;
  }

  const id = generateId();
  await db.prepare('INSERT INTO workspace_folders (id, workspace_id, name, parent_id, icon, color) VALUES (?, ?, ?, ?, ?, ?)').bind(id, workspaceId, name, actualParentId, icon || '📁', color || '#4A90D9').run();
  
  return c.json({ id, name, parentId });
});

foldersRouter.put('/:id', async (c) => {
  const folderId = c.req.param('id');
  const body = await c.req.json();
  const { name, parentId, icon, color } = body;
  const db = c.env.DB;
  
  const ws = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(folderId).first();
  if (ws) {
    if (name) await db.prepare('UPDATE workspaces SET name = ?, updated_at = datetime("now") WHERE id = ?').bind(name, folderId).run();
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
    const parentWs = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(parentId).first();
    updateFields.push('parent_id = ?');
    params.push(parentWs ? null : parentId);
  }

  if (updateFields.length > 0) {
    updateFields.push('updated_at = datetime("now")');
    params.push(folderId);
    await db.prepare(`UPDATE workspace_folders SET ${updateFields.join(', ')} WHERE id = ?`).bind(...params).run();
  }
  
  return c.json({ success: true });
});

foldersRouter.post('/:id/star', async (c) => {
  const folderId = c.req.param('id');
  await c.env.DB.prepare('UPDATE workspace_folders SET is_starred = 1, updated_at = datetime("now") WHERE id = ?').bind(folderId).run();
  return c.json({ success: true });
});

foldersRouter.post('/:id/unstar', async (c) => {
  const folderId = c.req.param('id');
  await c.env.DB.prepare('UPDATE workspace_folders SET is_starred = 0, updated_at = datetime("now") WHERE id = ?').bind(folderId).run();
  return c.json({ success: true });
});

foldersRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const db = c.env.DB;

  const ws = await db.prepare('SELECT id FROM workspaces WHERE id = ? AND owner_id = ?').bind(folderId, userId).first();
  if (ws) {
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
  
  const ws = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(folderId).first();
  let workspaceId = folderId;
  let workspaceFolderId = null;
  if (!ws) {
    const f = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(folderId).first<{ workspace_id: string }>();
    if (f) {
      workspaceId = f.workspace_id;
      workspaceFolderId = folderId;
    }
  }

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
