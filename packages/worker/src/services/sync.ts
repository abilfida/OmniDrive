let isShuttingDown = false;

export function getIsShuttingDown() {
  return isShuttingDown;
}

export function setShuttingDown(): void {
  isShuttingDown = true;
}

import type { DriveAccount } from '../types/index';
import { mapDriveRow } from '../types/index';
import { GoogleDriveService, type GDriveFile, type GDriveFolder } from './google-drive';
import { generateId } from '../lib/id';
import type { Env } from '../types/env';

const MIME_TYPE_FOLDER = 'application/vnd.google-apps.folder';
const MIME_TYPE_SHORTCUT = 'application/vnd.google-apps.shortcut';

function resolveParentId(parents: string[] | undefined | null, rootFolderId: string, isFolder: boolean): string | null {
  const defaultParent = isFolder ? null : 'root';
  const parentId = parents?.[0] ?? defaultParent;
  return parentId === rootFolderId ? defaultParent : parentId;
}

export const activeSyncs = new Set<string>();

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
      .first<{ change_token: string | null; next_page_token: string | null }>();

    let changeToken = syncState?.change_token;
    let nextPageToken = syncState?.next_page_token;

    if (!changeToken) {
      const completed = await performInitialSync(drive, db, driveService, nextPageToken ?? undefined);
      if (!completed) {
        throw new Error('Initial sync interrupted by shutdown');
      }
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
  driveService: GoogleDriveService,
  startPageToken?: string
): Promise<boolean> {
  console.log(`Initial sync for ${drive.email} — chunk processing`);

  const rootFolderId = await driveService.getRootFolderId(drive.id);
  const iterator = driveService.iterateAllFilesAndFolders(drive.id, startPageToken);

  for await (const chunk of iterator) {
    if (getIsShuttingDown()) {
      console.log(`Sync interrupted by shutdown for ${drive.email}. State saved.`);
      return false;
    }

    for (const folder of chunk.folders) {
      const parentId = resolveParentId(folder.parents, rootFolderId, true);
      await upsertDriveFolder(db, drive, folder, parentId);
    }

    for (const file of chunk.files) {
      const parentId = resolveParentId(file.parents, rootFolderId, false);
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
  return true;
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
    if (getIsShuttingDown()) return currentToken;
    const response = await driveService.listChanges(drive.id, currentToken);

    for (const change of response.changes) {
      if (getIsShuttingDown()) return currentToken;
      const isFolder = change.file?.mimeType === MIME_TYPE_FOLDER;

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

      if (file.mimeType === MIME_TYPE_SHORTCUT) continue;

      if (isFolder) {
        const parentId = resolveParentId(file.parents, rootFolderId, true);
        await upsertDriveFolder(db, drive, { id: file.id, name: file.name, parents: file.parents }, parentId);
      } else {
        const parentId = resolveParentId(file.parents, rootFolderId, false);
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
  const folderId = generateId();
  await db
    .prepare(
      `INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(drive_account_id, google_folder_id) DO UPDATE SET
         name = excluded.name,
         google_parent_id = excluded.google_parent_id`
    )
    .bind(folderId, drive.id, folder.id, googleParentId, folder.name)
    .run();
}

async function upsertFile(
  db: D1Database,
  drive: DriveAccount,
  file: GDriveFile,
  googleParentId: string | null
): Promise<void> {
  const fileId = generateId();
  await db
    .prepare(
      `INSERT INTO files
         (id, user_id, drive_account_id, google_file_id, google_parent_id, name, mime_type, size,
          thumbnail_url, web_view_link, web_content_link, google_created_at, google_modified_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(drive_account_id, google_file_id) DO UPDATE SET
         name = excluded.name,
         mime_type = excluded.mime_type,
         size = excluded.size,
         thumbnail_url = excluded.thumbnail_url,
         web_view_link = excluded.web_view_link,
         web_content_link = excluded.web_content_link,
         google_modified_at = excluded.google_modified_at,
         google_parent_id = excluded.google_parent_id,
         synced_at = excluded.synced_at`
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

export async function runScheduledSync(env: {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}): Promise<void> {
  if (getIsShuttingDown()) return;

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
