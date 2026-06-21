import { Hono } from 'hono';
import { authGuard } from '../middleware/auth-guard';
import { generateId } from '../lib/id';
import { encrypt } from '../lib/crypto';
import type { AppContext } from '../types/env';

export const s3CredentialsRouter = new Hono<AppContext>();

s3CredentialsRouter.use('*', authGuard);

s3CredentialsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const { description } = await c.req.json();
  const db = c.env.DB;

  const id = generateId();
  const accessKeyId = 'OMNI' + generateId().substring(0, 16).toUpperCase();
  const rawSecretKey = generateId() + generateId(); // Long secret key
  const secretKeyEnc = await encrypt(rawSecretKey, c.env.TOKEN_ENCRYPTION_KEY);

  await db.prepare(`
    INSERT INTO s3_credentials (id, user_id, access_key_id, secret_key_enc, description)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userId, accessKeyId, secretKeyEnc, description || null).run();

  return c.json({
    id,
    accessKeyId,
    secretAccessKey: rawSecretKey,
    description,
    createdAt: new Date().toISOString()
  }, 201);
});

s3CredentialsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db.prepare(`
    SELECT id, access_key_id, description, created_at 
    FROM s3_credentials WHERE user_id = ?
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
