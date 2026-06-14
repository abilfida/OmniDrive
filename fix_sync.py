import re

with open('packages/worker/src/services/sync.ts', 'r') as f:
    content = f.read()

# 1. Add constants and resolveParentId
content = content.replace(
"""import { generateId } from '../lib/id';
import type { Env } from '../types/env';

export const activeSyncs = new Set<string>();""",
"""import { generateId } from '../lib/id';
import type { Env } from '../types/env';

const MIME_TYPE_FOLDER = 'application/vnd.google-apps.folder';
const MIME_TYPE_SHORTCUT = 'application/vnd.google-apps.shortcut';

function resolveParentId(parents: string[] | undefined | null, rootFolderId: string, isFolder: boolean): string | null {
  const defaultParent = isFolder ? null : 'root';
  const parentId = parents?.[0] ?? defaultParent;
  return parentId === rootFolderId ? defaultParent : parentId;
}

export const activeSyncs = new Set<string>();""")

# 2. Fix syncDriveAccount
content = content.replace(
"""    if (!changeToken) {
      await performInitialSync(drive, db, driveService, nextPageToken ?? undefined);
      changeToken = await driveService.getStartPageToken(drive.id);
    } else {""",
"""    if (!changeToken) {
      const completed = await performInitialSync(drive, db, driveService, nextPageToken ?? undefined);
      if (!completed) {
        throw new Error('Initial sync interrupted by shutdown');
      }
      changeToken = await driveService.getStartPageToken(drive.id);
    } else {""")

# 3. Fix performInitialSync return type & logic
content = content.replace(
"""async function performInitialSync(
  drive: DriveAccount,
  db: D1Database,
  driveService: GoogleDriveService,
  startPageToken?: string
): Promise<void> {
  console.log(`Initial sync for ${drive.email} — chunk processing`);

  const rootFolderId = await driveService.getRootFolderId(drive.id);
  const iterator = driveService.iterateAllFilesAndFolders(drive.id, startPageToken);

  for await (const chunk of iterator) {
    if (getIsShuttingDown()) {
      console.log(`Sync interrupted by shutdown for ${drive.email}. State saved.`);
      break;
    }

    for (const folder of chunk.folders) {
      let parentId = folder.parents?.[0] ?? null;
      if (parentId === rootFolderId) parentId = null;
      await upsertDriveFolder(db, drive, folder, parentId);
    }

    for (const file of chunk.files) {
      let parentId = file.parents?.[0] ?? 'root';
      if (parentId === rootFolderId) parentId = 'root';
      await upsertFile(db, drive, file, parentId);
    }""",
"""async function performInitialSync(
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
    }""")

content = content.replace(
"""    // Save checkpoint
    if (chunk.nextPageToken) {
      await db
        .prepare('UPDATE sync_state SET next_page_token = ? WHERE drive_account_id = ?')
        .bind(chunk.nextPageToken, drive.id)
        .run();
    }
  }
}""",
"""    // Save checkpoint
    if (chunk.nextPageToken) {
      await db
        .prepare('UPDATE sync_state SET next_page_token = ? WHERE drive_account_id = ?')
        .bind(chunk.nextPageToken, drive.id)
        .run();
    }
  }
  return true;
}""")


# 4. Fix performIncrementalSync
content = content.replace(
"""      const isFolder = change.file?.mimeType === 'application/vnd.google-apps.folder';

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
      }""",
"""      const isFolder = change.file?.mimeType === MIME_TYPE_FOLDER;

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
      }""")


# 5. Fix upsert functions
upsert_original = """async function upsertDriveFolder(
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
}"""

upsert_replacement = """async function upsertDriveFolder(
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
}"""

content = content.replace(upsert_original, upsert_replacement)

with open('packages/worker/src/services/sync.ts', 'w') as f:
    f.write(content)
