export let isShuttingDown = false;

export function setShuttingDown(): void {
  isShuttingDown = true;
}

import type { DriveAccount } from '../types/index';
import { mapDriveRow } from '../types/index';
import { GoogleDriveService, type GDriveFile, type GDriveFolder } from './google-drive';
import { generateId } from '../lib/id';
import type { Env } from '../types/env';

export async function syncDriveFolder(_env: Env, _driveId: string, _folderId: string, _userId: string): Promise<void> {
  // implemented by another task
}

export async function syncDriveAccount(
  drive: DriveAccount,
  db: D1Database,
  _kv: KVNamespace,
  driveService: GoogleDriveService
): Promise<void> {
  // Update status to syncing
  await db
    .prepare("INSERT INTO sync_state (drive_account_id, status) VALUES (?, 'syncing') ON CONFLICT(drive_account_id) DO UPDATE SET status = 'syncing', error_message = NULL")
    .bind(drive.id)
    .run();

  try {
    const syncState = await db
      .prepare('SELECT * FROM sync_state WHERE drive_account_id = ?')
      .bind(drive.id)
      .first();

    let changeToken = syncState?.change_token as string | null;

    if (!changeToken) {
      await performInitialSync(drive, db, driveService);
      changeToken = await driveService.getStartPageToken(drive.id);
    } else {
      changeToken = await performIncrementalSync(drive, db, changeToken, driveService);
    }

    await db
      .prepare(
        "INSERT INTO sync_state (drive_account_id, status, last_synced_at, change_token) VALUES (?, 'idle', CURRENT_TIMESTAMP, ?) ON CONFLICT(drive_account_id) DO UPDATE SET status = 'idle', last_synced_at = CURRENT_TIMESTAMP, change_token = excluded.change_token"
      )
      .bind(drive.id, changeToken)
      .run();

    try {
      await driveService.getQuota(drive.id);
    } catch {
      // Non-fatal
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Sync failed for ${drive.email}:`, message);

    await db
      .prepare("INSERT INTO sync_state (drive_account_id, status, error_message) VALUES (?, 'error', ?) ON CONFLICT(drive_account_id) DO UPDATE SET status = 'error', error_message = excluded.error_message")
      .bind(drive.id, message)
      .run();
  }
}

async function performInitialSync(
  drive: DriveAccount,
  db: D1Database,
  driveService: GoogleDriveService
): Promise<void> {
  console.log(`Initial sync for ${drive.email} — crawling Drive root`);

  const rootFolderId = await driveService.getRootFolderId(drive.id);
  const { files, folders } = await driveService.listAllFilesAndFolders(drive.id);

  for (const folder of folders) {
    let parentId = folder.parents?.[0] ?? null;
    if (parentId === rootFolderId) parentId = null;
    await upsertDriveFolder(db, drive, folder, parentId);
  }

  for (const file of files) {
    let parentId = file.parents?.[0] ?? 'root';
    if (parentId === rootFolderId) parentId = 'root';
    await upsertFile(db, drive, file, parentId);
  }
}

async function performIncrementalSync(
  drive: DriveAccount,
  db: D1Database,
  pageToken: string,
  driveService: GoogleDriveService
): Promise<string> {
  console.log(`Incremental sync for ${drive.email} from token ${pageToken}`);

  const rootFolderId = await driveService.getRootFolderId(drive.id);

  let currentToken = pageToken;
  let hasMore = true;

  while (hasMore) {
    const response = await driveService.listChanges(drive.id, currentToken);

    for (const change of response.changes) {
      const isFolder = change.file?.mimeType === 'application/vnd.google-apps.folder';

      if (change.removed || change.file?.trashed) {
        if (isFolder) {
          await db
            .prepare('DELETE FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?')
            .bind(drive.id, change.fileId)
            .run();
        } else {
          await db
            .prepare('DELETE FROM files WHERE drive_account_id = ? AND google_file_id = ?')
            .bind(drive.id, change.fileId)
            .run();
        }
        continue;
      }

      const file = change.file;
      if (!file) continue;

      if (file.mimeType === 'application/vnd.google-apps.shortcut') continue;

      if (isFolder) {
        let parentId = file.parents?.[0] ?? null;
        if (parentId === rootFolderId) parentId = null;
        await upsertDriveFolder(db, drive, { id: file.id, name: file.name, parents: file.parents }, parentId);
      } else {
        let parentId = file.parents?.[0] ?? 'root';
        if (parentId === rootFolderId) parentId = 'root';
        await upsertFile(db, drive, file as unknown as GDriveFile, parentId);
      }
    }

    if (response.newStartPageToken) {
      return response.newStartPageToken;
    }

    if (response.nextPageToken) {
      currentToken = response.nextPageToken;
    } else {
      hasMore = false;
    }
  }

  return currentToken;
}

async function upsertDriveFolder(
  db: D1Database,
  drive: DriveAccount,
  folder: GDriveFolder,
  googleParentId: string | null
): Promise<void> {
  const existing = await db
    .prepare('SELECT id FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?')
    .bind(drive.id, folder.id)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare('UPDATE drive_folders SET name = ?, google_parent_id = ? WHERE id = ?')
      .bind(folder.name, googleParentId, existing.id)
      .run();
  } else {
    const folderId = generateId();
    await db
      .prepare(
        `INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .bind(folderId, drive.id, folder.id, googleParentId, folder.name)
      .run();
  }
}

async function upsertFile(
  db: D1Database,
  drive: DriveAccount,
  file: GDriveFile,
  googleParentId: string
): Promise<void> {
  const existing = await db
    .prepare('SELECT id FROM files WHERE drive_account_id = ? AND google_file_id = ?')
    .bind(drive.id, file.id)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE files
         SET name = ?, mime_type = ?, size = ?, thumbnail_url = ?, web_view_link = ?,
             web_content_link = ?, google_modified_at = ?, google_parent_id = ?,
             synced_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        file.name,
        file.mimeType,
        parseInt(file.size ?? '0', 10),
        file.thumbnailLink ?? null,
        file.webViewLink ?? null,
        file.webContentLink ?? null,
        file.modifiedTime,
        googleParentId,
        existing.id
      )
      .run();
  } else {
    const fileId = generateId();
    await db
      .prepare(
        `INSERT INTO files
           (id, user_id, drive_account_id, google_file_id, google_parent_id, name, mime_type, size,
            thumbnail_url, web_view_link, web_content_link, google_created_at, google_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        fileId,
        drive.userId,
        drive.id,
        file.id,
        googleParentId,
        file.name,
        file.mimeType,
        parseInt(file.size ?? '0', 10),
        file.thumbnailLink ?? null,
        file.webViewLink ?? null,
        file.webContentLink ?? null,
        file.createdTime,
        file.modifiedTime
      )
      .run();
  }
}

export async function runScheduledSync(env: {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}): Promise<void> {
  const driveService = new GoogleDriveService(env.KV, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.TOKEN_ENCRYPTION_KEY);

  const rows = await env.DB.prepare("SELECT * FROM drive_accounts WHERE type = 'oauth'").all();
  const driveAccounts = (rows.results ?? []).map(mapDriveRow);

  console.log(`Syncing ${driveAccounts.length} drive accounts`);

  await Promise.allSettled(
    driveAccounts.map((drive) =>
      syncDriveAccount(drive, env.DB, env.KV, driveService).catch((err) => {
        console.error(`Sync error for ${drive.email}:`, err);
      })
    )
  );
}
