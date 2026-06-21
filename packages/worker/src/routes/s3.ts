import { Hono } from 'hono';
import { s3AuthMiddleware } from '../middleware/s3-auth';
import type { AppContext } from '../types/env';

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
      <Name>${ws.name}</Name>
      <CreationDate>${parseSqliteDate(ws.created_at).toISOString()}</CreationDate>
    </Bucket>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Owner>
    <ID>${userId}</ID>
    <DisplayName>${userId}</DisplayName>
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
    return c.text(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>Bucket not found</Message></Error>`, 404, { 'Content-Type': 'application/xml' });
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
    SELECT f.id, f.name, f.size, f.updated_at, COALESCE(fp.path, '') || f.name as s3_key
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
    <Key>${key}</Key>
    <LastModified>${parseSqliteDate(file.updated_at).toISOString()}</LastModified>
    <ETag>"${file.id}"</ETag>
    <Size>${file.size}</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>\n`;
      }
    } else {
      // Recursive List (No Delimiter)
      contentsXml += `  <Contents>
    <Key>${key}</Key>
    <LastModified>${parseSqliteDate(file.updated_at).toISOString()}</LastModified>
    <ETag>"${file.id}"</ETag>
    <Size>${file.size}</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>\n`;
    }
  }

  let prefixesXml = '';
  for (const pref of commonPrefixesSet) {
    prefixesXml += `  <CommonPrefixes>
    <Prefix>${pref}</Prefix>
  </CommonPrefixes>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>${bucketName}</Name>
  <Prefix>${prefix}</Prefix>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
${contentsXml}${prefixesXml}</ListBucketResult>`;

  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
});
