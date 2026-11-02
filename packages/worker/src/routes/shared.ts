import { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';

import type { AppContext } from '../types/env';
import { authGuard } from '../middleware/auth-guard';
import { mapSharedLinkRow, type SharedLink } from '../types';
import { generateId } from '../lib/id';
import { GoogleDriveService } from '../services/google-drive';
import { validateWebhookUrl } from '../lib/validation';
import { getWorkspaceRole, hasPermission } from '../middleware/rbac';


export const sharedRouter = new Hono<AppContext>({ strict: false });

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Short fingerprint of the link's password hash, embedded in share sessions so
// changing the password signs existing visitors out. Hashed again so the
// cookie doesn't carry part of the stored hash.
async function passwordVersion(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Parses an optional expiry from the request. undefined = not provided,
// null = no expiry, or an ISO string. Unparseable input would otherwise be
// stored as-is and never compare as expired.
function parseExpiry(value: unknown): { ok: true; value: string | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === '') return { ok: true, value: null };
  const time = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? { ok: false } : { ok: true, value: new Date(time).toISOString() };
}

function isValidDownloadLimit(value: unknown): boolean {
  return value === null || value === undefined || (Number.isInteger(value) && (value as number) > 0);
}

async function validateSharedLink(c: Context<AppContext>, link: SharedLink): Promise<{ ok: boolean; status?: number; error?: string; requiresPassword?: boolean }> {
  if (link.expiresAt) {
    const expiry = new Date(link.expiresAt).getTime();
    // Fail closed: a stored value that doesn't parse counts as expired.
    if (Number.isNaN(expiry) || expiry < Date.now()) {
      return { ok: false, status: 410, error: 'Link expired' };
    }
  }
  
  const requiresPassword = !!link.passwordHash;
  if (!requiresPassword) {
    return { ok: true };
  }
  
  const sessionCookie = getCookie(c, `shared_session_${link.id}`);
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.JWT_SECRET, 'HS256');
      if (payload.id === link.id && payload.pv === await passwordVersion(link.passwordHash!)) {
        return { ok: true };
      }
    } catch (e) {
      // Invalid token
    }
  }
  
  return { ok: false, status: 401, error: 'Password required', requiresPassword: true };
}

// ─── Management Endpoints (Require Auth) ───

sharedRouter.post('/', authGuard, async (c) => {
  const userId = c.get('userId');
  
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { targetType, targetId, password, expiresAt, allowDownloads = true, allowUploads = false, maxDownloads = null, requireEmail = false, webhookUrl = null } = body;
  if (!targetType || !targetId) {
    return c.json({ error: 'targetType and targetId are required' }, 400);
  }
  const expiry = parseExpiry(expiresAt);
  if (!expiry.ok) return c.json({ error: 'expiresAt must be a valid date' }, 400);
  if (!isValidDownloadLimit(maxDownloads)) return c.json({ error: 'maxDownloads must be a positive whole number' }, 400);

  const db = c.env.DB;

  // Verify the caller may publish the target
  if (targetType === 'file') {
    const file = await db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ?').bind(targetId, userId).first();
    if (!file) return c.json({ error: 'You do not own this file' }, 403);
  } else if (targetType === 'folder') {
    const folder = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(targetId).first<{ workspace_id: string }>();
    const role = folder ? await getWorkspaceRole(db, folder.workspace_id, userId) : null;
    if (!role || !hasPermission(role, 'editor')) return c.json({ error: 'You cannot share this folder' }, 403);
  } else {
    return c.json({ error: "targetType must be 'file' or 'folder'" }, 400);
  }

  // Validate webhook URL if provided
  if (webhookUrl) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
  
  let passwordHash = null;
  
  if (password) {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const saltArray = Array.from(salt);
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHex = saltArray.map(b => b.toString(16).padStart(2, '0')).join('');
    passwordHash = `${saltHex}:${hashHex}`;
  }

  let id = '';
  let attempts = 0;
  const maxAttempts = 3;
  let success = false;

  while (attempts < maxAttempts && !success) {
    id = generateId().replace(/-/g, '').slice(0, 16); // 64-bit entropy slug
    try {
      await db.prepare(
        'INSERT INTO shared_links (id, user_id, target_type, target_id, password_hash, expires_at, allow_downloads, allow_uploads, max_downloads, require_email, webhook_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, userId, targetType, targetId, passwordHash, expiry.value ?? null, allowDownloads ? 1 : 0, allowUploads ? 1 : 0, maxDownloads, requireEmail ? 1 : 0, webhookUrl)
      .run();
      success = true;
    } catch (e: any) {
      if (e.message && e.message.includes('UNIQUE constraint failed')) {
        attempts++;
      } else {
        console.error('Error creating shared link:', e);
        return c.json({ error: 'Failed to create shared link' }, 500);
      }
    }
  }

  if (!success) {
    return c.json({ error: 'Could not generate unique ID for shared link' }, 500);
  }

  // Ensure no trailing slash in FRONTEND_URL if present, though typically it won't have one
  const baseUrl = c.env.FRONTEND_URL.replace(/\/$/, '');
  return c.json({ id, url: `${baseUrl}/shared/${id}` });
});

sharedRouter.get('/', authGuard, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  
  const { results } = await db.prepare(`
    SELECT s.*, COALESCE(f.name, v.name) as targetName 
    FROM shared_links s 
    LEFT JOIN files f ON s.target_type = 'file' AND s.target_id = f.id 
    LEFT JOIN workspace_folders v ON s.target_type = 'folder' AND s.target_id = v.id 
    WHERE s.user_id = ?
  `).bind(userId).all();
  return c.json({ links: results.map(mapSharedLinkRow) });
});

sharedRouter.put('/:id', authGuard, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const db = c.env.DB;
  
  const existing = await db.prepare('SELECT * FROM shared_links WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) {
    return c.json({ error: 'Link not found' }, 404);
  }

  const {
    expiresAt = existing.expires_at,
    allowDownloads = existing.allow_downloads === 1,
    allowUploads = existing.allow_uploads === 1,
    maxDownloads = existing.max_downloads,
    requireEmail = existing.require_email === 1,
    webhookUrl = existing.webhook_url,
    password
  } = body;

  const expiry = parseExpiry(body.expiresAt);
  if (!expiry.ok) return c.json({ error: 'expiresAt must be a valid date' }, 400);
  if (!isValidDownloadLimit(body.maxDownloads)) return c.json({ error: 'maxDownloads must be a positive whole number' }, 400);

  if (webhookUrl && webhookUrl !== existing.webhook_url) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
  
  let passwordHash = existing.password_hash;
  
  if (password !== undefined) {
    if (password === null || password === '') {
      passwordHash = null;
    } else {
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(password);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordData,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const saltArray = Array.from(salt);
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const saltHex = saltArray.map(b => b.toString(16).padStart(2, '0')).join('');
      passwordHash = `${saltHex}:${hashHex}`;
    }
  }
  
  const result = await db.prepare(
    'UPDATE shared_links SET expires_at = ?, allow_downloads = ?, allow_uploads = ?, max_downloads = ?, require_email = ?, webhook_url = ?, password_hash = ? WHERE id = ? AND user_id = ?'
  )
  .bind(
    expiry.value === undefined ? (expiresAt || null) : expiry.value,
    allowDownloads ? 1 : 0,
    allowUploads ? 1 : 0,
    maxDownloads || null,
    requireEmail ? 1 : 0,
    webhookUrl || null,
    passwordHash,
    id,
    userId
  )
  .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Link not found or no changes made' }, 404);
  }

  return c.json({ success: true });
});

sharedRouter.delete('/:id', authGuard, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  
  await c.env.DB.prepare('DELETE FROM shared_links WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return c.json({ success: true });
});

// ─── Public Endpoints (No Auth) ───

sharedRouter.get('/:id/meta', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  
  const row = await db.prepare('SELECT * FROM shared_links WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Link not found' }, 404);
  
  const link = mapSharedLinkRow(row as Record<string, unknown>);
  
  const validation = await validateSharedLink(c, link);
  if (!validation.ok) {
    return c.json({ error: validation.error, requiresPassword: validation.requiresPassword }, validation.status as any);
  }
  
  c.executionCtx.waitUntil(
    db.prepare('UPDATE shared_links SET view_count = view_count + 1 WHERE id = ?').bind(id).run()
  );
  
  c.executionCtx.waitUntil(
    db.prepare('INSERT INTO shared_link_logs (shared_link_id, action) VALUES (?, ?)').bind(id, 'view').run()
  );

  // Public endpoint: return only what the share page renders, never internal ids.
  if (link.targetType === 'file') {
    const file = await db.prepare('SELECT name, mime_type, size FROM files WHERE id = ?')
      .bind(link.targetId).first<{ name: string; mime_type: string; size: number }>();
    if (!file) return c.json({ error: 'File not found' }, 404);
    return c.json({
      type: 'file',
      target: { name: file.name, mimeType: file.mime_type, size: file.size },
      allowDownloads: link.allowDownloads,
    });
  } else {
    return c.json({ type: 'folder', allowDownloads: link.allowDownloads });
  }
});

sharedRouter.post('/:id/verify', async (c) => {
  const id = c.req.param('id');
  
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  
  const { password } = body;
  if (!password) return c.json({ error: 'Password is required' }, 400);
  
  const db = c.env.DB;
  
  const row = await db.prepare('SELECT * FROM shared_links WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Link not found' }, 404);
  const link = mapSharedLinkRow(row as Record<string, unknown>);
  
  if (!link.passwordHash) return c.json({ error: 'Link does not require password' }, 400);
  
  const [saltHex, storedHashHex] = link.passwordHash.split(':');
  
  const saltMatch = saltHex.match(/.{1,2}/g);
  if (!saltMatch) return c.json({ error: 'Invalid salt format' }, 500);
  const salt = new Uint8Array(saltMatch.map(byte => parseInt(byte, 16)));
  
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (!timingSafeEqualStr(storedHashHex, hashHex)) {
    return c.json({ error: 'Invalid password' }, 401);
  }
  
  const token = await sign(
    { id, pv: await passwordVersion(link.passwordHash!), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 },
    c.env.JWT_SECRET,
    'HS256'
  );
  setCookie(c, `shared_session_${id}`, token, { path: '/', httpOnly: true, secure: true, sameSite: 'None', maxAge: 60 * 60 * 24 });
  return c.json({ success: true });
});

sharedRouter.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  
  const row = await db.prepare('SELECT * FROM shared_links WHERE id = ?').bind(id).first();
  if (!row) return c.text('Not found', 404);
  const link = mapSharedLinkRow(row as Record<string, unknown>);
  
  const validation = await validateSharedLink(c, link);
  if (!validation.ok) {
    return c.text(validation.error || 'Unauthorized', validation.status as any);
  }

  if (!link.allowDownloads) {
    return c.text('Downloads are disabled for this link', 403);
  }

  // Claim a download atomically: a separate check and increment let concurrent
  // requests exceed max_downloads.
  const claim = await db.prepare(
    'UPDATE shared_links SET download_count = download_count + 1 WHERE id = ? AND (max_downloads IS NULL OR download_count < max_downloads)'
  ).bind(id).run();
  if (claim.meta.changes === 0) {
    return c.text('Maximum download limit reached', 403);
  }

  c.executionCtx.waitUntil(
    db.prepare('INSERT INTO shared_link_logs (shared_link_id, action) VALUES (?, ?)').bind(id, 'download').run()
  );

  // Trigger webhook async if exists
  if (link.webhookUrl) {
    c.executionCtx.waitUntil(
      fetch(link.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download', linkId: id })
      }).catch(() => {}) // Fire and forget
    );
  }

  if (link.targetType === 'file') {
    const file = await db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').bind(link.targetId, link.userId).first();
    if (!file) return c.text('File not found', 404);

    const driveAccount = await db.prepare('SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?').bind(file.drive_account_id, link.userId).first();
    if (!driveAccount) return c.text('Drive account not found', 404);

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
      // Exported files don't have a reliable pre-known size
      c.header('Content-Length', String(file.size));
    }
    
    return c.body(stream);
  } else {
    return c.text('Folder download not supported yet', 400);
  }
});
