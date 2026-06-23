import { Hono } from 'hono';
import { authGuard } from '../middleware/auth-guard';
import { generateId } from '../lib/id';
import { encrypt } from '../lib/crypto';
import { getWorkspaceRole } from '../middleware/rbac';
import type { AppContext } from '../types/env';

export const s3CredentialsRouter = new Hono<AppContext>();

s3CredentialsRouter.use('*', authGuard);

s3CredentialsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const { description, workspaceId } = await c.req.json();
  const db = c.env.DB;

  if (workspaceId) {
    const role = await getWorkspaceRole(db, workspaceId, userId);
    if (!role || (role !== 'manager' && role !== 'owner')) {
      return c.json({ error: 'Unauthorized to manage S3 keys for this workspace' }, 403);
    }
  }

  const id = generateId();
  const accessKeyId = 'OMNI' + generateId().substring(0, 16).toUpperCase();
  const rawSecretKey = generateId() + generateId(); // Long secret key
  const secretKeyEnc = await encrypt(rawSecretKey, c.env.TOKEN_ENCRYPTION_KEY);

  await db.prepare(`
    INSERT INTO s3_credentials (id, user_id, access_key_id, secret_key_enc, description, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, userId, accessKeyId, secretKeyEnc, description || null, workspaceId || null).run();

  return c.json({
    id,
    accessKeyId,
    secretAccessKey: rawSecretKey,
    description,
    workspaceId: workspaceId || null,
    createdAt: new Date().toISOString()
  }, 201);
});

s3CredentialsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db.prepare(`
    SELECT c.id, c.access_key_id, c.description, c.created_at, c.workspace_id, w.name as workspace_name
    FROM s3_credentials c
    LEFT JOIN workspaces w ON c.workspace_id = w.id
    WHERE c.user_id = ?
  `).bind(userId).all();

  return c.json(results);
});

s3CredentialsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = c.env.DB;

  await db.prepare('DELETE FROM s3_credentials WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return c.json({ success: true });
});
