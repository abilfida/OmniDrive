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

export function resolveParentId(parents: string[] | undefined | null, rootFolderId: string, isFolder: boolean): string | null {
  const defaultParent = isFolder ? null : 'root';
  const parentId = parents?.[0] ?? defaultParent;
  return parentId === rootFolderId ? defaultParent : parentId;
}

export const activeSyncs = new Set<string>();

export async function syncDriveFolder(_env: Env, _driveId: string, _folderId: string, _userId: string): Promise<void> {
  // implemented by another task
}

// Change token captured when an initial listing starts. It is kept in KV (not
// sync_state) so a listing that spans several cron runs resumes with it.
const startTokenKey = (driveId: string) => `sync:start_token:${driveId}`;

// Cross-isolate sync lock. The status flip in D1 is atomic; the KV lease (with a
// TTL) tells a live sync apart from one whose worker died mid-run, which would
// otherwise leave the drive stuck in 'syncing' forever.
const leaseKey = (driveId: string) => `sync:lease:${driveId}`;
const LEASE_TTL_SECONDS = 15 * 60; // Cloudflare's cron wall-clock limit

// Changes pages handled per run (1000 changes each). A larger backlog continues
// on the next run from the saved token instead of exceeding per-invocation limits.
const MAX_CHANGE_PAGES_PER_RUN = 10;

async function acquireSyncLease(db: D1Database, kv: KVNamespace, driveId: string): Promise<boolean> {
  await db.prepare("INSERT INTO sync_state (drive_account_id, status) VALUES (?, 'idle') ON CONFLICT(drive_account_id) DO NOTHING")
    .bind(driveId).run();
  const claimed = await db.prepare("UPDATE sync_state SET status = 'syncing', error_message = NULL WHERE drive_account_id = ? AND status != 'syncing'")
    .bind(driveId).run();
  if (claimed.meta.changes === 0 && (await kv.get(leaseKey(driveId)))) {
    return false; // another run is syncing this drive right now
  }
  await kv.put(leaseKey(driveId), String(Date.now()), { expirationTtl: LEASE_TTL_SECONDS });
  return true;
}

export async function syncDriveAccount(
  drive: DriveAccount,
  db: D1Database,
  kv: KVNamespace,
  driveService: GoogleDriveService
): Promise<void> {
  if (!(await acquireSyncLease(db, kv, drive.id))) {
    console.log(`Skipping sync for ${drive.email}: already syncing`);
    return;
  }

  try {
    const syncState = await db
      .prepare('SELECT * FROM sync_state WHERE drive_account_id = ?')
      .bind(drive.id)
      .first<{ change_token: string | null; next_page_token: string | null }>();

    let changeToken = syncState?.change_token;
    let nextPageToken = syncState?.next_page_token;

    if (!changeToken) {
      // Take the change token *before* listing: anything created, renamed or
      // deleted while the listing runs is then replayed by the next incremental sync.
      let startToken = nextPageToken ? await kv.get(startTokenKey(drive.id)) : null;
      if (!startToken) {
        startToken = await driveService.getStartPageToken(drive.id);
        await kv.put(startTokenKey(drive.id), startToken);
      }
      const completed = await performInitialSync(drive, db, driveService, nextPageToken ?? undefined);
      if (!completed) {
        throw new Error('Initial sync interrupted by shutdown');
      }
      changeToken = startToken;
    } else {
      changeToken = await performIncrementalSync(drive, db, changeToken, driveService);
    }

    await db
      .prepare(
        "INSERT INTO sync_state (drive_account_id, status, last_synced_at, change_token, next_page_token) VALUES (?, 'idle', CURRENT_TIMESTAMP, ?, NULL) ON CONFLICT(drive_account_id) DO UPDATE SET status = 'idle', last_synced_at = CURRENT_TIMESTAMP, change_token = excluded.change_token, next_page_token = NULL"
      )
      .bind(drive.id, changeToken)
      .run();
    await kv.delete(startTokenKey(drive.id));

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
  } finally {
    await kv.delete(leaseKey(drive.id));
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

    // One batch per page instead of one round trip per item.
    const statements = [
      ...chunk.folders.map((folder) => upsertDriveFolder(db, drive, folder, resolveParentId(folder.parents, rootFolderId, true))),
      ...chunk.files.map((file) => upsertFile(db, drive, file, resolveParentId(file.parents, rootFolderId, false))),
    ];
    if (statements.length > 0) await db.batch(statements);

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

  for (let page = 0; page < MAX_CHANGE_PAGES_PER_RUN; page++) {
    if (getIsShuttingDown()) return currentToken;
    const response = await driveService.listChanges(drive.id, currentToken);
    const statements: D1PreparedStatement[] = [];

    for (const change of response.changes) {
      if (change.removed || change.file?.trashed) {
        // Removals carry no file details, so the item may be a file or a folder.
        statements.push(
          db.prepare('DELETE FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?').bind(drive.id, change.fileId),
          db.prepare('DELETE FROM files WHERE drive_account_id = ? AND google_file_id = ?').bind(drive.id, change.fileId)
        );
        continue;
      }

      const file = change.file;
      if (!file || file.mimeType === MIME_TYPE_SHORTCUT) continue;

      if (file.mimeType === MIME_TYPE_FOLDER) {
        statements.push(upsertDriveFolder(db, drive, { id: file.id, name: file.name, parents: file.parents }, resolveParentId(file.parents, rootFolderId, true)));
      } else {
        statements.push(upsertFile(db, drive, file as unknown as GDriveFile, resolveParentId(file.parents, rootFolderId, false)));
      }
    }

    const nextToken = response.newStartPageToken ?? response.nextPageToken;
    // Apply the page and advance the saved token together, so a later failure
    // resumes after this page instead of replaying the whole backlog.
    if (nextToken) {
      statements.push(db.prepare('UPDATE sync_state SET change_token = ? WHERE drive_account_id = ?').bind(nextToken, drive.id));
    }
    if (statements.length > 0) await db.batch(statements);

    if (response.newStartPageToken || !response.nextPageToken) return nextToken ?? currentToken;
    currentToken = response.nextPageToken;
  }

  return currentToken;
}

function upsertDriveFolder(
  db: D1Database,
  drive: DriveAccount,
  folder: GDriveFolder,
  googleParentId: string | null
): D1PreparedStatement {
  const folderId = generateId();
  return db
    .prepare(
      `INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(drive_account_id, google_folder_id) DO UPDATE SET
         name = excluded.name,
         google_parent_id = excluded.google_parent_id`
    )
    .bind(folderId, drive.id, folder.id, googleParentId, folder.name);
}

function upsertFile(
  db: D1Database,
  drive: DriveAccount,
  file: GDriveFile,
  googleParentId: string | null
): D1PreparedStatement {
  const fileId = generateId();
  return db
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
    );
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
