import { Hono } from 'hono';
import type { AppContext } from '../types/env';
import { generateId } from '../lib/id';
import { authGuard } from '../middleware/auth-guard';
import { AppError } from '../middleware/error-handler';
import { GoogleDriveService } from '../services/google-drive';
import { resolveParentId } from '../services/sync';
import { getWorkspaceRole, hasPermission } from '../middleware/rbac';
import { UploadRouter } from '../services/upload-router';
import { AutomationEngine } from '../services/automation.service';
import { PolicyService } from '../services/policy.service';
import { mapDriveRow, mapFileRow, mapFolderRow } from '../types';

export const filesRouter = new Hono<AppContext>({ strict: false });

filesRouter.use('*', authGuard);

// GET /api/files/recent
filesRouter.get('/recent', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results: fileRows } = await db.prepare(`
    SELECT DISTINCT f.*, d.email as driveEmail 
    FROM files f
    JOIN drive_accounts d ON f.drive_account_id = d.id
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE (f.user_id = ? OR wm.user_id = ?)
      AND f.is_trashed = 0
    ORDER BY f.updated_at DESC LIMIT 20
  `).bind(userId, userId).all<Record<string, unknown> & { driveEmail: string }>();

  const { results: folderRows } = await db.prepare(`
    SELECT DISTINCT f.*, w.name as ws_name 
    FROM workspace_folders f
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    LEFT JOIN workspaces w ON f.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY f.updated_at DESC LIMIT 20
  `).bind(userId).all();

  // Need to import mapFolderRow if not already in scope, but we can inline the mapping if needed
  // Let's use mapFileRow and a simple folder mapper
  const folders = folderRows.map((f: any) => ({
    id: f.id,
    workspaceId: f.workspace_id,
    name: f.name,
    parentId: f.parent_id,
    icon: f.icon,
    color: f.color,
    isStarred: !!f.is_starred,
    metadata: f.metadata,
    createdAt: f.created_at,
    updatedAt: f.updated_at
  }));

  return c.json({
    files: fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail })),
    folders
  });
});

// GET /api/files/category-overview
filesRouter.get('/category-overview', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db.prepare(`
    SELECT mime_type, SUM(size) as total_size
    FROM files
    WHERE user_id = ? AND is_trashed = 0
    GROUP BY mime_type
  `).bind(userId).all<{ mime_type: string; total_size: number }>();

  const overview = {
    images: 0,
    videos: 0,
    documents: 0,
    audio: 0,
    archives: 0,
    others: 0,
  };

  for (const row of results) {
    const mime = row.mime_type || '';
    const size = row.total_size || 0;

    if (mime.startsWith('image/') || mime === 'application/vnd.google-apps.photo') {
      overview.images += size;
    } else if (mime.startsWith('video/') || mime === 'application/vnd.google-apps.video') {
      overview.videos += size;
    } else if (mime.startsWith('audio/') || mime === 'application/vnd.google-apps.audio') {
      overview.audio += size;
    } else if (
      mime.includes('pdf') ||
      mime.includes('document') ||
      mime.includes('msword') ||
      mime.includes('excel') ||
      mime.includes('spreadsheet') ||
      mime.includes('powerpoint') ||
      mime.includes('presentation') ||
      mime.startsWith('text/') ||
      mime === 'application/vnd.google-apps.document' ||
      mime === 'application/vnd.google-apps.spreadsheet' ||
      mime === 'application/vnd.google-apps.presentation' ||
      mime === 'application/vnd.google-apps.jam' ||
      mime === 'application/vnd.google-apps.form'
    ) {
      overview.documents += size;
    } else if (
      mime.includes('zip') ||
      mime.includes('rar') ||
      mime.includes('tar') ||
      mime.includes('gzip') ||
      mime === 'application/x-7z-compressed' ||
      mime === 'application/vnd.rar' ||
      mime === 'application/x-zip-compressed'
    ) {
      overview.archives += size;
    } else if (mime === 'application/vnd.google-apps.folder' || mime === 'application/vnd.google-apps.shortcut') {
      // ignore folders and shortcuts
    } else {
      overview.others += size;
    }
  }

  return c.json(overview);
});

// GET /api/files/search
filesRouter.get('/search', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  const workspaceId = c.req.query('workspaceId');
  const metadataRaw = c.req.query('metadata');
  
  const db = c.env.DB;
  
  let sql = `
    SELECT DISTINCT f.*, d.email as driveEmail 
    FROM files f
    JOIN drive_accounts d ON f.drive_account_id = d.id
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE (f.user_id = ? OR wm.user_id = ?)
      AND f.is_trashed = 0
  `;
  const binds: any[] = [userId, userId];

  if (query?.trim()) {
    sql += ` AND f.name LIKE ?`;
    binds.push(`%${query.trim()}%`);
  }

  if (workspaceId) {
    sql += ` AND f.workspace_id = ?`;
    binds.push(workspaceId);
  }

  if (metadataRaw) {
    try {
      const meta = JSON.parse(metadataRaw);
      for (const [key, value] of Object.entries(meta)) {
        sql += ` AND json_extract(f.metadata, '$.' || ?) = ?`;
        binds.push(key, String(value));
      }
    } catch (e) {
      // ignore invalid json
    }
  }

  sql += ` ORDER BY f.created_at DESC LIMIT 50`;

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown> & { driveEmail: string }>();

  return c.json({
    files: results.map((r) => ({
      ...mapFileRow(r),
      driveEmail: r.driveEmail,
    })),
    query: query || '',
  });
});


// GET /api/files/starred
filesRouter.get('/starred', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results: fileRows } = await db.prepare(
    'SELECT f.*, d.email as driveEmail FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id WHERE f.user_id = ? AND f.is_starred = 1 AND f.is_trashed = 0 ORDER BY f.created_at DESC'
  ).bind(userId).all();

  const { results: folderRows } = await db.prepare(
    'SELECT f.*, w.name as ws_name FROM workspace_folders f JOIN workspace_members wm ON f.workspace_id = wm.workspace_id JOIN workspaces w ON f.workspace_id = w.id WHERE wm.user_id = ? AND f.is_starred = 1 ORDER BY f.updated_at DESC'
  ).bind(userId).all();

  // Need to import mapFolderRow if not already
  return c.json({
    files: fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail })),
    folders: folderRows.map(mapFolderRow),
  });
});

// Move file to trash
filesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const db = c.env.DB;

  await db.prepare('UPDATE files SET is_trashed = 1 WHERE id = ? AND user_id = ?')
    .bind(fileId, userId).run();

  return c.json({ success: true });
});

// Rename file
filesRouter.patch('/:id/rename', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const { name: rawName } = await c.req.json<{ name?: unknown }>();
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) throw new AppError(400, 'Name is required');

  const file = await c.env.DB.prepare('SELECT drive_account_id, google_file_id FROM files WHERE id = ? AND user_id = ?')
    .bind(fileId, userId).first<{ drive_account_id: string; google_file_id: string }>();
  if (!file) throw new AppError(404, 'File not found');

  // Rename in Google first; otherwise the next sync would restore the old name.
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  await driveService.renameFile(file.drive_account_id, file.google_file_id, name);

  await c.env.DB.prepare('UPDATE files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(name, fileId, userId).run();

  return c.json({ success: true });
});

// Move file to different virtual folder
filesRouter.patch('/:id/move', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const { folderId } = await c.req.json();

  const folder = await c.env.DB.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(folderId).first<{ workspace_id: string }>();
  if (!folder && folderId) throw new AppError(404, 'Folder not found');

  await c.env.DB.prepare('UPDATE files SET workspace_folder_id = ?, workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(folderId, folder?.workspace_id || null, fileId, userId).run();

  return c.json({ success: true });
});

// Move file to another drive
filesRouter.post('/:id/move-drive', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const body = await c.req.json();
  const targetDriveId = body.targetDriveId;

  if (typeof targetDriveId !== 'string' || !targetDriveId.trim()) {
    throw new AppError(400, 'Target drive ID must be a non-empty string');
  }

  const db = c.env.DB;

  const file = await db.prepare(
    `SELECT f.*, d.email as driveEmail, d.id as sourceDriveId
     FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.id = ? AND f.user_id = ?`
  ).bind(fileId, userId).first<{ driveEmail: string; sourceDriveId: string; google_file_id: string; name: string }>();

  if (!file) {
    throw new AppError(404, 'File not found or unauthorized');
  }

  if (file.sourceDriveId === targetDriveId) {
    throw new AppError(400, 'File is already in the target drive');
  }

  const targetDrive = await db.prepare(
    'SELECT id, email FROM drive_accounts WHERE id = ? AND user_id = ?'
  ).bind(targetDriveId, userId).first<{ id: string; email: string }>();

  if (!targetDrive) {
    throw new AppError(404, 'Target drive not found or unauthorized');
  }

  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);

  let sharePermissionId: string | null = null;
  let copySuccessId: string | null = null;
  let trashSuccess = false;

  try {
    sharePermissionId = await driveService.shareFile(
      file.sourceDriveId,
      file.google_file_id,
      targetDrive.email,
      'writer'
    );

    const copiedFile = await driveService.copyFile(
      targetDriveId,
      file.google_file_id
    );
    copySuccessId = copiedFile.id;

    try {
      if (sharePermissionId) {
        await driveService.revokeShare(file.sourceDriveId, file.google_file_id, sharePermissionId);
        sharePermissionId = null;
      }
    } catch (revokeError) {
      console.error('Failed to revoke share after copy:', revokeError);
    }

    try {
      await driveService.trashFile(file.sourceDriveId, file.google_file_id);
      trashSuccess = true;
    } catch (trashError) {
      console.error('Failed to trash original file:', trashError);
    }

    await db.prepare(
      `UPDATE files 
       SET drive_account_id = ?, google_file_id = ?, google_parent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(targetDriveId, copiedFile.id, fileId).run();

    const updatedFile = await db.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first<Record<string, unknown>>();
    
    return c.json({ file: mapFileRow(updatedFile!), success: true });
  } catch (error) {
    console.error('Move drive failed:', error);
    
    if (trashSuccess) {
      try { await driveService.untrashFile(file.sourceDriveId, file.google_file_id); }
      catch (e) { console.error('Rollback untrash failed:', e); }
    }
    
    if (copySuccessId) {
      try { await driveService.deleteFile(targetDriveId, copySuccessId); }
      catch (e) { console.error('Rollback delete failed:', e); }
    }
    
    if (sharePermissionId) {
      try { await driveService.revokeShare(file.sourceDriveId, file.google_file_id, sharePermissionId); }
      catch (e) { console.error('Failed to revoke share:', e); }
    }
    
    throw new AppError(500, 'Failed to move file to another drive');
  }
});

// Resolves and authorizes the workspace a new upload is placed in. The workspace
// is derived from the folder when one is given, so the two can never disagree.
async function resolveUploadWorkspace(
  db: D1Database,
  userId: string,
  workspaceId?: string | null,
  workspaceFolderId?: string | null
): Promise<{ workspaceId: string | null; workspaceFolderId: string | null }> {
  if (workspaceFolderId) {
    const folder = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?')
      .bind(workspaceFolderId).first<{ workspace_id: string }>();
    if (!folder) throw new AppError(404, 'Workspace folder not found');
    if (workspaceId && workspaceId !== folder.workspace_id) {
      throw new AppError(400, 'Workspace folder does not belong to this workspace');
    }
    workspaceId = folder.workspace_id;
  }
  if (!workspaceId) return { workspaceId: null, workspaceFolderId: null };

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, 'editor')) {
    throw new AppError(403, 'Editor access to this workspace is required');
  }
  return { workspaceId, workspaceFolderId: workspaceFolderId || null };
}

// Initialize upload (returns Google Drive Resumable URL)
filesRouter.post('/upload/init', async (c) => {
  const userId = c.get('userId');
  const { name, mimeType, size, driveAccountId, parentFolderId, workspaceId, workspaceFolderId } = await c.req.json<{
    name?: string;
    mimeType?: string;
    size?: number;
    driveAccountId?: string;
    parentFolderId?: string; // Google folder ID inside driveAccountId
    workspaceId?: string;
    workspaceFolderId?: string;
  }>();
  const db = c.env.DB;

  if (!name || typeof name !== 'string') throw new AppError(400, 'File name is required');
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) throw new AppError(400, 'File size is required');
  if (parentFolderId && !driveAccountId) {
    throw new AppError(400, 'driveAccountId is required when uploading into a Google folder');
  }

  const target = await resolveUploadWorkspace(db, userId, workspaceId, workspaceFolderId);
  if (target.workspaceId) {
    const policyService = new PolicyService(db);
    const hasQuota = await policyService.checkQuota(target.workspaceId, size);
    if (!hasQuota) {
      return c.json({ error: 'Storage quota exceeded' }, 403);
    }
  }

  // 1. Pick the drive: the one the user chose, or the one with the most free space
  const { results: driveRows } = await db.prepare('SELECT * FROM drive_accounts WHERE user_id = ?').bind(userId).all();
  if (driveRows.length === 0) throw new AppError(400, 'No connected drives');

  const drives = driveRows.map(mapDriveRow).map((d) => ({
    ...d,
    freeSpace: Math.max(0, d.totalQuota - d.usedQuota),
    usagePercent: d.totalQuota > 0 ? (d.usedQuota / d.totalQuota) * 100 : 0
  }));
  const targetDrive = new UploadRouter(drives).selectDriveForUpload(size, driveAccountId);

  // 2. Open a resumable session; the browser streams the bytes straight to Google
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  const uploadUrl = await driveService.initiateResumableUpload(
    targetDrive.id,
    name,
    mimeType || 'application/octet-stream',
    parentFolderId || 'root',
    c.env.FRONTEND_URL
  );

  return c.json({
    uploadUrl,
    driveAccountId: targetDrive.id,
    googleFolderId: parentFolderId || 'root',
  });
});

filesRouter.post('/upload/finalize', async (c) => {
  const userId = c.get('userId');
  const { googleFileId, driveAccountId, workspaceFolderId, workspaceId } = await c.req.json<{
    googleFileId?: string;
    driveAccountId?: string;
    workspaceId?: string;
    workspaceFolderId?: string;
  }>();

  if (!googleFileId || !driveAccountId) {
    throw new AppError(400, 'Missing required fields: googleFileId, driveAccountId');
  }

  // Verify drive belongs to user
  const db = c.env.DB;
  const drive = await db.prepare('SELECT id FROM drive_accounts WHERE id = ? AND user_id = ?')
    .bind(driveAccountId, userId).first();
    
  if (!drive) {
    throw new AppError(404, 'Drive account not found or unauthorized');
  }

  const target = await resolveUploadWorkspace(db, userId, workspaceId, workspaceFolderId);

  // Fetch file metadata from Google Drive
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  const [gFile, rootFolderId] = await Promise.all([
    driveService.getFile(driveAccountId, googleFileId),
    driveService.getRootFolderId(driveAccountId),
  ]);
  // Same parent convention as sync, so the file appears in drive folder listings
  const googleParentId = resolveParentId(gFile.parents, rootFolderId, false);
  const fileSize = parseInt(gFile.size || '0', 10);

  // Sync may already have inserted this file, or the client may be retrying.
  const existing = await db.prepare('SELECT id, workspace_id FROM files WHERE drive_account_id = ? AND google_file_id = ?')
    .bind(driveAccountId, gFile.id).first<{ id: string; workspace_id: string | null }>();
  const id = existing?.id ?? generateId();

  await db.prepare(`
    INSERT INTO files (
      id, user_id, drive_account_id, workspace_id, workspace_folder_id, google_parent_id,
      google_file_id, name, mime_type, size, thumbnail_url, web_view_link, web_content_link,
      google_created_at, google_modified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(drive_account_id, google_file_id) DO UPDATE SET
      workspace_id = COALESCE(excluded.workspace_id, files.workspace_id),
      workspace_folder_id = COALESCE(excluded.workspace_folder_id, files.workspace_folder_id),
      google_parent_id = excluded.google_parent_id,
      name = excluded.name,
      mime_type = excluded.mime_type,
      size = excluded.size,
      thumbnail_url = excluded.thumbnail_url,
      web_view_link = excluded.web_view_link,
      web_content_link = excluded.web_content_link,
      google_modified_at = excluded.google_modified_at
  `).bind(
    id, userId, driveAccountId, target.workspaceId, target.workspaceFolderId, googleParentId,
    gFile.id, gFile.name, gFile.mimeType, fileSize,
    gFile.thumbnailLink || null, gFile.webViewLink || null, gFile.webContentLink || null,
    gFile.createdTime, gFile.modifiedTime
  ).run();

  // Count the bytes against the workspace only the first time the file lands in it
  if (target.workspaceId && fileSize > 0 && existing?.workspace_id !== target.workspaceId) {
    const policyService = new PolicyService(db);
    await policyService.updateWorkspaceStorage(target.workspaceId, fileSize);
  }

  // Invalidate quota cache
  await c.env.KV.delete(`quota:${driveAccountId}`);

  const created = await db.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();

  const engine = new AutomationEngine(c.env);
  c.executionCtx.waitUntil(engine.processEventTrigger({ ...created, user_id: userId } as any, c.executionCtx));

  return c.json({ file: mapFileRow(created!), success: true }, 201);
});

// GET /api/files/trash
filesRouter.get('/trash', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  
  const { results } = await db.prepare(
    `SELECT f.*, d.email as driveEmail FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.user_id = ? AND f.is_trashed = 1
     ORDER BY f.updated_at DESC`
  ).bind(userId).all<Record<string, unknown> & { driveEmail: string }>();

  return c.json({
    files: results.map((r) => ({
      ...mapFileRow(r),
      driveEmail: r.driveEmail,
    }))
  });
});

// POST /api/files/:id/restore
filesRouter.post('/:id/restore', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  
  const { meta } = await c.env.DB.prepare('UPDATE files SET is_trashed = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(fileId, userId).run();

  if (meta.changes === 0) {
    throw new AppError(404, 'File not found');
  }

  return c.json({ success: true });
});


filesRouter.post('/:id/star', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const { meta } = await c.env.DB.prepare('UPDATE files SET is_starred = 1 WHERE id = ? AND user_id = ?').bind(fileId, userId).run();
  if (meta.changes === 0) throw new AppError(404, 'File not found');
  return c.json({ success: true });
});

filesRouter.post('/:id/unstar', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const { meta } = await c.env.DB.prepare('UPDATE files SET is_starred = 0 WHERE id = ? AND user_id = ?').bind(fileId, userId).run();
  if (meta.changes === 0) throw new AppError(404, 'File not found');
  return c.json({ success: true });
});

// DELETE /api/files/:id/permanent
filesRouter.delete('/:id/permanent', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const db = c.env.DB;

  const file = await db.prepare(
    `SELECT f.google_file_id, f.size, f.workspace_id, f.workspace_folder_id, d.id as driveId 
     FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.id = ? AND f.user_id = ? AND f.is_trashed = 1`
  ).bind(fileId, userId).first<{ google_file_id: string; size: number; workspace_id: string; workspace_folder_id: string; driveId: string }>();

  if (!file) throw new AppError(404, 'File not found in trash');

  if (file.workspace_folder_id) {
    const policyService = new PolicyService(db);
    const protectedRet = await policyService.checkRetentionProtection(file.workspace_folder_id);
    if (protectedRet) {
      return c.json({ error: 'Retention policy prevents deletion' }, 403);
    }
  }

  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  
  try {
    await driveService.deleteFile(file.driveId, file.google_file_id);
  } catch (error) {
    console.error('Failed to permanently delete file from Google Drive:', error);
    throw new AppError(500, 'Failed to delete file from Google Drive');
  }

  await db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').bind(fileId, userId).run();

  if (file.workspace_id && file.size) {
    const policyService = new PolicyService(db);
    await policyService.updateWorkspaceStorage(file.workspace_id, -file.size);
  }

  return c.json({ success: true });
});

filesRouter.patch('/:id/metadata', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const { metadata } = await c.req.json();
  const db = c.env.DB;

  const file = await db.prepare('SELECT user_id, workspace_id FROM files WHERE id = ?').bind(fileId).first<{ user_id: string; workspace_id: string }>();
  if (!file) throw new AppError(404, 'File not found');

  if (file.workspace_id) {
    const role = await getWorkspaceRole(db, file.workspace_id, userId);
    if (!role || !hasPermission(role, 'editor')) {
      throw new AppError(403, 'Forbidden');
    }
  } else if (file.user_id !== userId) {
    throw new AppError(403, 'Forbidden');
  }

  await db.prepare('UPDATE files SET metadata = ? WHERE id = ?').bind(JSON.stringify(metadata), fileId).run();
  
  return c.json({ success: true });
});

// GET /api/files/:id/download
filesRouter.get('/:id/download', async (c) => {
  const userId = c.get('userId');
  const fileId = c.req.param('id');
  const db = c.env.DB;

  const file = await db.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first<any>();
  if (!file) throw new AppError(404, 'File not found');

  if (file.workspace_id) {
    const { getWorkspaceRole, hasPermission } = await import('../middleware/rbac');
    const role = await getWorkspaceRole(db, file.workspace_id, userId);
    if (!role || !hasPermission(role, 'viewer')) {
      throw new AppError(403, 'Forbidden');
    }
  } else if (file.user_id !== userId) {
    throw new AppError(403, 'Forbidden');
  }

  const driveService = new GoogleDriveService(
    c.env.KV,
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.TOKEN_ENCRYPTION_KEY
  );

  let stream: ReadableStream<Uint8Array>;
  let finalMimeType = (file.mime_type as string) || 'application/octet-stream';
  let finalFileName = file.name as string;

  try {
    const downloadResult = await driveService.downloadFile(
      file.drive_account_id as string,
      file.google_file_id as string,
      file.mime_type as string
    );
    stream = downloadResult.stream;
    
    if (downloadResult.exportedMimeType && downloadResult.exportedExtension) {
      finalMimeType = downloadResult.exportedMimeType;
      finalFileName = `${finalFileName}${downloadResult.exportedExtension}`;
    }
  } catch (e: any) {
    console.error('Download error:', e);
    return c.text('Failed to download file', 502);
  }
  
  c.header('Content-Type', finalMimeType);
  c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
  if (file.size && !finalFileName.endsWith('.pdf') && !finalFileName.endsWith('.xlsx')) {
    c.header('Content-Length', String(file.size));
  }
  
  return c.body(stream);
});
