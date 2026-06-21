import { Hono } from 'hono';
import { s3AuthMiddleware } from '../middleware/s3-auth';
import type { AppContext } from '../types/env';
import { GoogleDriveService } from '../services/google-drive';
import { generateId } from '../lib/id';
import { calculateMD5ForStream, getMD5HashingStream } from '../lib/crypto-s3';
import { UploadRouter } from '../services/upload-router';
import { mapDriveRow } from '../types';

export const s3Router = new Hono<AppContext>({ strict: false });

function parseSqliteDate(dateStr: string | number): Date {
  if (typeof dateStr === 'number') {
    return new Date(dateStr);
  }
  if (!dateStr) {
    return new Date();
  }
  if (/^\d+$/.test(dateStr)) {
    return new Date(parseInt(dateStr, 10));
  }
  if (dateStr.includes('T') || dateStr.endsWith('Z')) {
    return new Date(dateStr);
  }
  // Convert "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SSZ"
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function getFileETag(file: { id: string; metadata?: string | null }): string {
  if (file.metadata) {
    try {
      const meta = JSON.parse(file.metadata);
      if (meta && typeof meta === 'object' && meta.md5) {
        return meta.md5;
      }
    } catch (e) {
      // ignore
    }
  }
  return file.id;
}

s3Router.use('*', s3AuthMiddleware);

// GET /s3/ (List Buckets - maps to workspaces)
s3Router.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results: workspaces } = await db.prepare(`
    SELECT w.id, w.name, w.created_at 
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
  `).bind(userId).all<any>();

  let bucketsXml = '';
  for (const ws of workspaces) {
    bucketsXml += `    <Bucket>
      <Name>${escapeXml(ws.name)}</Name>
      <CreationDate>${escapeXml(parseSqliteDate(ws.created_at).toISOString())}</CreationDate>
    </Bucket>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Owner>
    <ID>${escapeXml(userId)}</ID>
    <DisplayName>${escapeXml(userId)}</DisplayName>
  </Owner>
  <Buckets>
${bucketsXml}  </Buckets>
</ListAllMyBucketsResult>`;

  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
});

// GET /s3/:bucket (List Objects V2)
s3Router.get('/:bucket', async (c) => {
  const userId = c.get('userId');
  const bucketName = c.req.param('bucket');
  const prefix = c.req.query('prefix') || '';
  const delimiter = c.req.query('delimiter') || '';
  const db = c.env.DB;

  // Resolve Workspace by Bucket Name
  const workspace = await db.prepare(`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.name = ? AND wm.user_id = ?
  `).bind(bucketName, userId).first<any>();

  if (!workspace) {
    const errorCode = 'NoSuchBucket';
    const errorMessage = 'Bucket not found';
    return c.text(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${escapeXml(errorCode)}</Code><Message>${escapeXml(errorMessage)}</Message></Error>`, 404, { 'Content-Type': 'application/xml' });
  }

  // Recursive SQLite CTE to assemble flat S3 keys for all workspace files
  const { results: files } = await db.prepare(`
    WITH RECURSIVE folder_path(id, path) AS (
        SELECT id, name || '/' FROM workspace_folders WHERE parent_id IS NULL AND workspace_id = ?
        UNION ALL
        SELECT f.id, fp.path || f.name || '/'
        FROM workspace_folders f
        JOIN folder_path fp ON f.parent_id = fp.id
        WHERE f.workspace_id = ?
    )
    SELECT f.id, f.name, f.size, f.updated_at, f.metadata, COALESCE(fp.path, '') || f.name as s3_key
    FROM files f
    LEFT JOIN folder_path fp ON f.workspace_folder_id = fp.id
    WHERE f.workspace_id = ? AND f.is_trashed = 0
  `).bind(workspace.id, workspace.id, workspace.id).all<any>();

  let contentsXml = '';
  const commonPrefixesSet = new Set<string>();

  for (const file of files) {
    const key = file.s3_key;
    if (!key.startsWith(prefix)) continue;

    if (delimiter === '/') {
      const rest = key.substring(prefix.length);
      const parts = rest.split('/');
      if (parts.length > 1) {
        // Directory
        commonPrefixesSet.add(prefix + parts[0] + '/');
      } else {
        // Immediate File
        contentsXml += `  <Contents>
    <Key>${escapeXml(key)}</Key>
    <LastModified>${escapeXml(parseSqliteDate(file.updated_at).toISOString())}</LastModified>
    <ETag>"${escapeXml(getFileETag(file))}"</ETag>
    <Size>${file.size}</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>\n`;
      }
    } else {
      // Recursive List (No Delimiter)
      contentsXml += `  <Contents>
    <Key>${escapeXml(key)}</Key>
    <LastModified>${escapeXml(parseSqliteDate(file.updated_at).toISOString())}</LastModified>
    <ETag>"${escapeXml(getFileETag(file))}"</ETag>
    <Size>${file.size}</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>\n`;
    }
  }

  let prefixesXml = '';
  for (const pref of commonPrefixesSet) {
    prefixesXml += `  <CommonPrefixes>
    <Prefix>${escapeXml(pref)}</Prefix>
  </CommonPrefixes>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>${escapeXml(bucketName)}</Name>
  <Prefix>${escapeXml(prefix)}</Prefix>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
${contentsXml}${prefixesXml}</ListBucketResult>`;

  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
});

// Helpers to resolve virtual folders dynamically
async function getWorkspaceFolder(db: any, workspaceId: string, folderPath: string): Promise<string | null | undefined> {
  if (!folderPath) return null;
  const segments = folderPath.split('/').filter(Boolean);
  let parentId: string | null = null;
  for (const name of segments) {
    const existing = await db.prepare(`
      SELECT id FROM workspace_folders 
      WHERE workspace_id = ? AND name = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
    `).bind(workspaceId, name, parentId, parentId).first<any>();
    if (!existing) return undefined;
    parentId = existing.id;
  }
  return parentId;
}

async function getOrCreateWorkspaceFolder(db: any, workspaceId: string, folderPath: string): Promise<string | null> {
  if (!folderPath) return null;
  const segments = folderPath.split('/').filter(Boolean);
  let parentId: string | null = null;

  for (const name of segments) {
    const existing = await db.prepare(`
      SELECT id FROM workspace_folders 
      WHERE workspace_id = ? AND name = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))
    `).bind(workspaceId, name, parentId, parentId).first<any>();

    if (existing) {
      parentId = existing.id;
    } else {
      const newId = generateId();
      await db.prepare(`
        INSERT INTO workspace_folders (id, workspace_id, name, parent_id)
        VALUES (?, ?, ?, ?)
      `).bind(newId, workspaceId, name, parentId).run();
      parentId = newId;
    }
  }

  return parentId;
}

// HEAD /s3/:bucket/:key (HeadObject - Get Metadata)
s3Router.on('HEAD', '/:bucket/:key{.+}', async (c) => {
  const userId = c.get('userId');
  const bucketName = c.req.param('bucket');
  const key = c.req.param('key');
  const db = c.env.DB;

  const workspace = await db.prepare(`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.name = ? AND wm.user_id = ?
  `).bind(bucketName, userId).first<any>();

  if (!workspace) return c.text('Not Found', 404);

  const pathParts = key.split('/');
  const fileName = pathParts.pop();
  const folderPath = pathParts.join('/');

  const folderId = await getWorkspaceFolder(db, workspace.id, folderPath);
  if (folderId === undefined) return c.text('Not Found', 404);

  const file = await db.prepare(`
    SELECT * FROM files 
    WHERE workspace_id = ? AND name = ? AND (workspace_folder_id = ? OR (workspace_folder_id IS NULL AND ? IS NULL))
      AND is_trashed = 0
  `).bind(workspace.id, fileName, folderId, folderId).first<any>();

  if (!file) return c.text('Not Found', 404);

  c.header('Content-Type', file.mime_type || 'application/octet-stream');
  c.header('Content-Length', String(file.size));
  c.header('ETag', `"${getFileETag(file)}"`);
  return c.body(null);
});

// GET /s3/:bucket/:key (GetObject - Download)
s3Router.get('/:bucket/:key{.+}', async (c) => {
  const userId = c.get('userId');
  const bucketName = c.req.param('bucket');
  const key = c.req.param('key');
  const db = c.env.DB;

  const workspace = await db.prepare(`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.name = ? AND wm.user_id = ?
  `).bind(bucketName, userId).first<any>();

  if (!workspace) return c.text('Bucket not found', 404);

  // Split S3 key to locate file
  const pathParts = key.split('/');
  const fileName = pathParts.pop();
  const folderPath = pathParts.join('/');

  const folderId = await getWorkspaceFolder(db, workspace.id, folderPath);
  if (folderId === undefined) return c.text('Object not found', 404);

  const file = await db.prepare(`
    SELECT * FROM files 
    WHERE workspace_id = ? AND name = ? AND (workspace_folder_id = ? OR (workspace_folder_id IS NULL AND ? IS NULL))
      AND is_trashed = 0
  `).bind(workspace.id, fileName, folderId, folderId).first<any>();

  if (!file) return c.text('Object not found', 404);

  if (c.req.method === 'HEAD') {
    c.header('Content-Type', file.mime_type || 'application/octet-stream');
    c.header('Content-Length', String(file.size));
    c.header('ETag', `"${getFileETag(file)}"`);
    return c.body(null);
  }

  const driveService = new GoogleDriveService(
    c.env.KV,
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.TOKEN_ENCRYPTION_KEY
  );

  const { stream } = await driveService.downloadFile(file.drive_account_id, file.google_file_id);
  c.header('Content-Type', file.mime_type || 'application/octet-stream');
  c.header('Content-Length', String(file.size));
  c.header('ETag', `"${getFileETag(file)}"`);
  return c.body(stream);
});

// DELETE /s3/:bucket/:key (DeleteObject)
s3Router.delete('/:bucket/:key{.+}', async (c) => {
  const userId = c.get('userId');
  const bucketName = c.req.param('bucket');
  const key = c.req.param('key');
  const db = c.env.DB;

  const workspace = await db.prepare(`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.name = ? AND wm.user_id = ?
  `).bind(bucketName, userId).first<any>();

  if (!workspace) return c.text('Bucket not found', 404);

  const pathParts = key.split('/');
  const fileName = pathParts.pop();
  const folderPath = pathParts.join('/');

  const folderId = await getWorkspaceFolder(db, workspace.id, folderPath);
  if (folderId === undefined) return c.text('Object not found', 404);

  const file = await db.prepare(`
    SELECT * FROM files 
    WHERE workspace_id = ? AND name = ? AND (workspace_folder_id = ? OR (workspace_folder_id IS NULL AND ? IS NULL))
      AND is_trashed = 0
  `).bind(workspace.id, fileName, folderId, folderId).first<any>();

  if (!file) return c.text('Object not found', 404);

  const driveService = new GoogleDriveService(
    c.env.KV,
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.TOKEN_ENCRYPTION_KEY
  );

  // Trash/delete file in Google Drive and update SQLite
  await driveService.deleteFile(file.drive_account_id, file.google_file_id);
  await db.prepare('UPDATE files SET is_trashed = 1 WHERE id = ?').bind(file.id).run();

  return c.body(null, 204);
});

// PUT /s3/:bucket/:key (PutObject or UploadPart)
s3Router.put('/:bucket/:key{.+}', async (c) => {
  const uploadId = c.req.query('uploadId');
  const partNumberStr = c.req.query('partNumber');

  if (uploadId && partNumberStr) {
    // Handled in Task 7 (Upload Part)
    return handleUploadPart(c, uploadId, parseInt(partNumberStr, 10));
  }

  const userId = c.get('userId');
  const bucketName = c.req.param('bucket');
  const key = c.req.param('key');
  const db = c.env.DB;

  const workspace = await db.prepare(`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.name = ? AND wm.user_id = ?
  `).bind(bucketName, userId).first<any>();

  if (!workspace) return c.text('Bucket not found', 404);

  const contentLength = parseInt(c.req.header('Content-Length') || '0', 10);
  const mimeType = c.req.header('Content-Type') || 'application/octet-stream';

  // 1. Select target Drive using UploadRouter
  const { results: driveRows } = await db.prepare('SELECT * FROM drive_accounts WHERE user_id = ?').bind(userId).all();
  if (driveRows.length === 0) return c.text('No connected drives', 400);

  const drives = driveRows.map(mapDriveRow).map((d) => ({
    ...d,
    freeSpace: Math.max(0, d.totalQuota - d.usedQuota),
    usagePercent: d.totalQuota > 0 ? (d.usedQuota / d.totalQuota) * 100 : 0
  }));

  const router = new UploadRouter(drives);
  const targetDrive = router.selectDriveForUpload(contentLength);

  // 2. Hash data on-the-fly to get ETag
  const bodyStream = c.req.raw.body;
  if (!bodyStream) return c.text('Empty request body', 400);

  const { stream: hashingStream, getHash } = getMD5HashingStream();
  const pipedStream = bodyStream.pipeThrough(hashingStream);

  // 3. Perform Direct Google Drive Upload
  const driveService = new GoogleDriveService(
    c.env.KV,
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    c.env.TOKEN_ENCRYPTION_KEY
  );

  const pathParts = key.split('/');
  const fileName = pathParts.pop();
  const folderPath = pathParts.join('/');
  const folderId = await getOrCreateWorkspaceFolder(db, workspace.id, folderPath);

  // Check if file already exists in D1 under the same folder/name/workspace
  const existingFile = await db.prepare(`
    SELECT id, drive_account_id, google_file_id FROM files
    WHERE workspace_id = ? AND name = ? AND (workspace_folder_id = ? OR (workspace_folder_id IS NULL AND ? IS NULL))
      AND is_trashed = 0
  `).bind(workspace.id, fileName, folderId || null, folderId || null).first<any>();

  // Initiate resumable session
  const uploadUrl = await driveService.initiateResumableUpload(
    targetDrive.id,
    fileName!,
    mimeType,
    targetDrive.rootFolderId || 'root'
  );

  // Pipe the hashed stream
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Length': String(contentLength) },
    body: pipedStream as any
  });

  if (!response.ok) return c.text('Upload to Google Drive failed', 502);

  // Get Google File ID from response headers / body
  const rawBody = await response.text();
  const gFile = JSON.parse(rawBody);

  // Get the calculated MD5 hash after the stream has been fully consumed
  const md5Hex = getHash();

  // If the file exists, delete it from Google Drive and remove its D1 row to prevent duplicates
  if (existingFile) {
    try {
      await driveService.deleteFile(existingFile.drive_account_id, existingFile.google_file_id);
    } catch (err) {
      console.error('Failed to delete old file from Google Drive:', err);
    }
    await db.prepare('DELETE FROM files WHERE id = ?').bind(existingFile.id).run();
  }

  const fileId = generateId();
  await db.prepare(`
    INSERT INTO files (
      id, user_id, drive_account_id, workspace_id, workspace_folder_id, 
      google_file_id, name, mime_type, size, metadata, google_created_at, google_modified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    fileId, userId, targetDrive.id, workspace.id, folderId || null,
    gFile.id, fileName, mimeType, contentLength, JSON.stringify({ md5: md5Hex })
  ).run();

  c.header('ETag', `"${md5Hex}"`);
  return c.text('', 200);
});

// Placeholder helper to keep compiler happy until Task 7 is written
async function handleUploadPart(c: any, uploadId: string, partNumber: number): Promise<Response> {
  return c.text('Multipart Upload Part not implemented yet', 501);
}
