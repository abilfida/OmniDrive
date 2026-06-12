import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { AppError } from '../middleware/error-handler';
import type { AppContext } from '../types/env';
import { authGuard } from '../middleware/auth-guard';
import { GoogleDriveService } from '../services/google-drive';
import { syncDriveAccount } from '../services/sync';
import { mapDriveRow, mapDriveFolderRow, mapFileRow } from '../types';
import { generateId } from '../lib/id';
import type { BreadcrumbItem } from '../types';
import { decryptOrPassthrough } from '../lib/crypto';

export async function buildDriveBreadcrumb(db: D1Database, driveId: string, googleFolderId: string): Promise<BreadcrumbItem[]> {
  const path: BreadcrumbItem[] = [];
  
  if (googleFolderId && googleFolderId !== 'root') {
    const query = `
      WITH RECURSIVE breadcrumb_path(id, google_parent_id, name, lvl) AS (
        SELECT google_folder_id, google_parent_id, name, 0 as lvl 
        FROM drive_folders 
        WHERE drive_account_id = ? AND google_folder_id = ?
        UNION ALL
        SELECT d.google_folder_id, d.google_parent_id, d.name, bp.lvl + 1 
        FROM drive_folders d
        JOIN breadcrumb_path bp ON d.google_folder_id = bp.google_parent_id
        WHERE d.drive_account_id = ?
      )
      SELECT id, name FROM breadcrumb_path ORDER BY lvl DESC
    `;
    const { results } = await db.prepare(query).bind(driveId, googleFolderId, driveId).all<{ id: string, name: string }>();
    for (const row of results) {
      path.push({ id: row.id, name: row.name });
    }
  }
  
  path.unshift({ id: 'root', name: 'All Files' });
  return path;
}

export const drivesRouter = new Hono<AppContext>({ strict: false });

drivesRouter.use('*', authGuard);

drivesRouter.get('/connect', (c) => {
  const env = c.env;
  
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Google OAuth is not configured. Please use a Service Account JSON to connect your drives.');
  }

  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const scope = 'openid email profile https://www.googleapis.com/auth/drive';

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'select_account consent');

  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 5 });
  authUrl.searchParams.append('state', state);

  return c.redirect(authUrl.toString());
});

drivesRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db
    .prepare('SELECT * FROM drive_accounts WHERE user_id = ?')
    .bind(userId)
    .all();

  const drives = results.map(mapDriveRow);

  const drivesWithQuota = await Promise.all(drives.map(async (drive) => {
    const encryptedTokens = await c.env.KV.get(`tokens:${drive.id}`);
    if (!encryptedTokens) return { ...drive, freeSpace: 0, usagePercent: 0 };
    const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);

    try {
      // Use the robust GoogleDriveService which handles token caching & refreshing
      const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
      
      // Ensure available under oauth: prefix for GoogleDriveService
      await c.env.KV.put(`oauth:${drive.id}`, tokenJson);
      
      const quota = await driveService.getQuota(drive.id);

      const freeSpace = quota.total - quota.used;
      const usagePercent = quota.total > 0 ? (quota.used / quota.total) * 100 : 0;

      c.executionCtx.waitUntil(
        db.prepare('UPDATE drive_accounts SET total_quota = ?, used_quota = ?, quota_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(quota.total, quota.used, drive.id).run()
      );

      return { ...drive, totalQuota: quota.total, usedQuota: quota.used, freeSpace, usagePercent };

    } catch (e) {
      console.error(`Failed to fetch quota for drive ${drive.id}`, e);
      const freeSpace = Math.max(0, drive.totalQuota - drive.usedQuota);
      const usagePercent = drive.totalQuota > 0 ? (drive.usedQuota / drive.totalQuota) * 100 : 0;
      return { ...drive, freeSpace, usagePercent };
    }
  }));

  const aggregate = {
    totalQuota: drivesWithQuota.reduce((sum, d) => sum + d.totalQuota, 0),
    totalUsed: drivesWithQuota.reduce((sum, d) => sum + d.usedQuota, 0),
    totalFree: drivesWithQuota.reduce((sum, d) => sum + d.freeSpace, 0),
    driveCount: drivesWithQuota.length,
  };

  return c.json({ drives: drivesWithQuota, aggregate });
});

// ─── Folder read endpoint (from DB, no Google API call) ───

drivesRouter.get('/:driveId/folders/:googleFolderId', async (c) => {
  const userId = c.get('userId');
  const { driveId, googleFolderId } = c.req.param();

  const drive = await c.env.DB
    .prepare('SELECT id FROM drive_accounts WHERE id = ? AND user_id = ?')
    .bind(driveId, userId)
    .first();

  if (!drive) return c.json({ error: 'Drive not found' }, 404);

  const folder = googleFolderId === 'root'
    ? null
    : await c.env.DB
        .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?')
        .bind(driveId, googleFolderId)
        .first();

  const subfolderResult = googleFolderId === 'root'
    ? await c.env.DB
        .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id IS NULL')
        .bind(driveId)
        .all()
    : await c.env.DB
        .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?')
        .bind(driveId, googleFolderId)
        .all();

  const filesResult = await c.env.DB
    .prepare('SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?')
    .bind(driveId, googleFolderId)
    .all();

  const breadcrumb = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);

  return c.json({
    folder: folder
      ? mapDriveFolderRow(folder as Record<string, unknown>)
      : { googleFolderId: 'root', name: 'My Drive', isSynced: true },
    subfolders: subfolderResult.results.map(r => mapDriveFolderRow(r as Record<string, unknown>)),
    files: filesResult.results.map(r => mapFileRow(r as Record<string, unknown>)),
    breadcrumb,
  });
});

// ─── Manual drive sync endpoint ───

drivesRouter.post('/:id/sync', async (c) => {
  const userId = c.get('userId');
  const driveId = c.req.param('id');

  const row = await c.env.DB
    .prepare('SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?')
    .bind(driveId, userId)
    .first();

  if (!row) return c.json({ error: 'Drive not found' }, 404);

  const drive = mapDriveRow(row as Record<string, unknown>);
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  
  // Run the sync process in the background via c.executionCtx.waitUntil
  // so the user doesn't have to wait for the entire sync to complete
  c.executionCtx.waitUntil(syncDriveAccount(drive, c.env.DB, c.env.KV, driveService));
  
  return c.json({ success: true });
});

// ─── Lazy folder sync endpoint ───
drivesRouter.post('/:driveId/folders/:googleFolderId/sync', async (c) => {
  const userId = c.get('userId');
  const { driveId, googleFolderId } = c.req.param();

  const driveRow = await c.env.DB
    .prepare('SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?')
    .bind(driveId, userId)
    .first();

  if (!driveRow) return c.json({ error: 'Drive not found' }, 404);

  const folder = await c.env.DB
    .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?')
    .bind(driveId, googleFolderId)
    .first();

  // Idempotency: already synced — return existing DB data
  if (folder && (folder as Record<string, unknown>).is_synced) {
    const subfolders = await c.env.DB
      .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?')
      .bind(driveId, googleFolderId)
      .all();
    const files = await c.env.DB
      .prepare('SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?')
      .bind(driveId, googleFolderId)
      .all();
    const breadcrumb = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);

    return c.json({
      folder: mapDriveFolderRow(folder as Record<string, unknown>),
      subfolders: subfolders.results.map(r => mapDriveFolderRow(r as Record<string, unknown>)),
      files: files.results.map(r => mapFileRow(r as Record<string, unknown>)),
      breadcrumb,
    });
  }

  // Fetch tokens
  const encryptedTokens = await c.env.KV.get(`tokens:${driveId}`);
  if (!encryptedTokens) return c.json({ error: 'No tokens for drive' }, 400);
  const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);

  // Ensure available under oauth: prefix for GoogleDriveService
  await c.env.KV.put(`oauth:${driveId}`, tokenJson);

  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  const { files: gFiles, folders: gFolders } = await driveService.listFolderContents(driveId, googleFolderId);

  const ownerUserId = (driveRow as Record<string, unknown>).user_id as string;

  for (const gFolder of gFolders) {
    const existing = await c.env.DB
      .prepare('SELECT id FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?')
      .bind(driveId, gFolder.id)
      .first<{ id: string }>();

    if (existing) {
      await c.env.DB
        .prepare('UPDATE drive_folders SET name = ?, google_parent_id = ? WHERE id = ?')
        .bind(gFolder.name, googleFolderId, existing.id)
        .run();
    } else {
      await c.env.DB
        .prepare(
          'INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .bind(generateId(), driveId, gFolder.id, googleFolderId, gFolder.name)
        .run();
    }
  }

  for (const gFile of gFiles) {
    const existing = await c.env.DB
      .prepare('SELECT id FROM files WHERE drive_account_id = ? AND google_file_id = ?')
      .bind(driveId, gFile.id)
      .first<{ id: string }>();

    if (existing) {
      await c.env.DB
        .prepare(
          `UPDATE files SET name = ?, mime_type = ?, size = ?, thumbnail_url = ?, web_view_link = ?,
           web_content_link = ?, google_modified_at = ?, google_parent_id = ?, synced_at = datetime('now')
           WHERE id = ?`
        )
        .bind(
          gFile.name, gFile.mimeType, parseInt(gFile.size ?? '0', 10),
          gFile.thumbnailLink ?? null, gFile.webViewLink ?? null, gFile.webContentLink ?? null,
          gFile.modifiedTime, googleFolderId, existing.id
        )
        .run();
    } else {
      await c.env.DB
        .prepare(
          `INSERT INTO files (id, user_id, drive_account_id, google_file_id, google_parent_id, name, mime_type, size,
             thumbnail_url, web_view_link, web_content_link, google_created_at, google_modified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          generateId(), ownerUserId, driveId, gFile.id, googleFolderId,
          gFile.name, gFile.mimeType, parseInt(gFile.size ?? '0', 10),
          gFile.thumbnailLink ?? null, gFile.webViewLink ?? null, gFile.webContentLink ?? null,
          gFile.createdTime, gFile.modifiedTime
        )
        .run();
    }
  }

  // Mark folder as synced
  if (folder) {
    await c.env.DB
      .prepare(`UPDATE drive_folders SET is_synced = 1, synced_at = datetime('now') WHERE drive_account_id = ? AND google_folder_id = ?`)
      .bind(driveId, googleFolderId)
      .run();
  }

  const newSubfolders = await c.env.DB
    .prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?')
    .bind(driveId, googleFolderId)
    .all();
  const newFiles = await c.env.DB
    .prepare('SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?')
    .bind(driveId, googleFolderId)
    .all();

  const breadcrumb = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);

  return c.json({
    folder: folder ? mapDriveFolderRow(folder as Record<string, unknown>) : null,
    subfolders: newSubfolders.results.map(r => mapDriveFolderRow(r as Record<string, unknown>)),
    files: newFiles.results.map(r => mapFileRow(r as Record<string, unknown>)),
    breadcrumb,
  });
});

drivesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const driveId = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM drive_accounts WHERE id = ? AND user_id = ?')
    .bind(driveId, userId).run();

  await c.env.KV.delete(`tokens:${driveId}`);
  await c.env.KV.delete(`oauth:${driveId}`);

  return c.json({ success: true });
});
