import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import * as bcrypt from 'bcryptjs';
import type { AppContext, SessionData } from '../types/env';
import { AuthService } from '../services/auth.service';
import { AppError } from '../middleware/error-handler';
import { generateId } from '../lib/id';
import { authGuard } from '../middleware/auth-guard';
import { validatePassword } from '../lib/validation';
import { generatePKCE } from '../lib/pkce';
import { encrypt } from '../lib/crypto';
import { syncDriveAccount } from '../services/sync';
import { GoogleDriveService } from '../services/google-drive';
import { mapDriveRow } from '../types';

export const authRouter = new Hono<AppContext>({ strict: false });

authRouter.get('/setup-status', async (c) => {
  const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.json({ isSetup: (result?.count || 0) > 0 });
});

authRouter.post('/register', async (c) => {
  const { name, username, password, email, invitation_code } = await c.req.json();
  if (!username || !password) throw new AppError(400, 'Username and password required');

  const passwordError = validatePassword(password);
  if (passwordError) throw new AppError(400, passwordError);

  const db = c.env.DB;

  // Validate everything before an invitation code is consumed.
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) throw new AppError(400, 'Username already exists');

  if (email) {
    const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existingEmail) throw new AppError(400, 'Email already exists');
  }

  const setupRes = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const isSetup = (setupRes?.count || 0) > 0;

  let invitationId: string | null = null;
  if (isSetup) {
    if (!invitation_code) throw new AppError(400, 'Invitation code required');
    const inv = await db.prepare('SELECT id FROM invitation_codes WHERE code = ?').bind(invitation_code).first<{ id: string }>();
    if (!inv) throw new AppError(400, 'Invalid invitation code');
    // Claim one use atomically so concurrent registrations can't exceed max_uses.
    const claim = await db.prepare(
      'UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ? AND (max_uses = 0 OR used_count < max_uses)'
    ).bind(inv.id).run();
    if (claim.meta.changes === 0) throw new AppError(400, 'Invitation code has reached its usage limit');
    invitationId = inv.id;
  }

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);
  const isSuperAdmin = isSetup ? 0 : 1;

  let inserted;
  try {
    // The first account becomes super admin only if the table is still empty at
    // insert time, so two racing setup requests can't both get admin rights.
    inserted = await db.prepare(
      `INSERT INTO users (id, username, password_hash, email, name, is_super_admin)
       SELECT ?, ?, ?, ?, ?, ? WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM users)`
    ).bind(id, username, passwordHash, email || null, name || username, isSuperAdmin, isSuperAdmin).run();
  } catch (err) {
    if (invitationId) await releaseInvitation(db, invitationId);
    if (err instanceof Error && /UNIQUE/i.test(err.message)) throw new AppError(400, 'Username or email already exists');
    throw err;
  }
  if (inserted.meta.changes === 0) {
    throw new AppError(409, 'Setup has already been completed; an invitation code is required');
  }

  const sessionData: SessionData = { userId: id, username, email: email || null, name: name || username, avatarUrl: null, role: isSuperAdmin ? 'super_admin' : 'member', createdAt: Date.now() };
  const sessionId = generateId();
  
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  const isSecure = c.env.WORKER_URL.startsWith('https://');
  setCookie(c, 'omnidrive_sid', sessionId, { path: '/', secure: isSecure, httpOnly: true, sameSite: isSecure ? 'None' : 'Lax', maxAge: 60 * 60 * 24 * 7 });

  return c.json({ success: true, user: sessionData, isSuperAdmin: !!isSuperAdmin });
});

// Gives back an invitation use claimed by a registration that then failed.
async function releaseInvitation(db: D1Database, invitationId: string) {
  await db.prepare('UPDATE invitation_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0').bind(invitationId).run();
}

authRouter.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) throw new AppError(400, 'Username and password required');

  const user = await c.env.DB.prepare('SELECT id, username, password_hash, email, name, avatar_url, is_super_admin FROM users WHERE username = ?').bind(username).first<any>();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'Invalid credentials');
  }

  const sessionData: SessionData = { userId: user.id, username: user.username, email: user.email, name: user.name, avatarUrl: user.avatar_url, role: user.is_super_admin ? 'super_admin' : 'member', createdAt: Date.now() };
  const sessionId = generateId();
  
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  const isSecure = c.env.WORKER_URL.startsWith('https://');
  setCookie(c, 'omnidrive_sid', sessionId, { path: '/', secure: isSecure, httpOnly: true, sameSite: isSecure ? 'None' : 'Lax', maxAge: 60 * 60 * 24 * 7 });

  return c.json({ success: true, user: sessionData });
});

// Protected routes below
authRouter.use('*', authGuard);

authRouter.get('/google', async (c) => {
  const env = c.env;
  
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Google OAuth is not configured. Please login with username and password.');
  }

  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const scope = 'openid email profile https://www.googleapis.com/auth/drive';

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'consent');

  const state = crypto.randomUUID();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  // Store state + PKCE verifier in KV (10-min TTL)
  await env.KV.put(`oauth_state:${state}`, JSON.stringify({ codeVerifier }), { expirationTtl: 600 });
  const isSecure = env.WORKER_URL.startsWith('https://');
  setCookie(c, 'oauth_state', state, { path: '/', httpOnly: true, secure: isSecure, sameSite: isSecure ? 'None' : 'Lax', maxAge: 60 * 5 });

  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return c.redirect(authUrl.toString());
});

authRouter.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) throw new AppError(400, 'Authorization code missing');

  const state = c.req.query('state');
  const savedState = getCookie(c, 'oauth_state');
  if (!state || state !== savedState) {
    throw new AppError(400, 'Invalid state parameter');
  }
  deleteCookie(c, 'oauth_state', { path: '/' });

  // Retrieve PKCE verifier from KV
  const stateDataJson = await c.env.KV.get(`oauth_state:${state}`);
  if (!stateDataJson) throw new AppError(400, 'OAuth state expired');
  const stateData = JSON.parse(stateDataJson);
  await c.env.KV.delete(`oauth_state:${state}`);

  const env = c.env;
  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const authService = new AuthService(env);

  const tokens = await authService.exchangeCodeForTokens(code, redirectUri, stateData.codeVerifier);
  const googleUser = await authService.fetchUserInfo(tokens.accessToken);

  const targetUserId = c.get('userId');
  const db = env.DB;

  await db.prepare('UPDATE users SET google_id = ? WHERE id = ?')
    .bind(googleUser.id, targetUserId).run();

  let drive = await db.prepare('SELECT id FROM drive_accounts WHERE google_account_id = ? AND user_id = ?').bind(googleUser.id, targetUserId).first<{ id: string }>();
  if (!drive) {
    const driveId = generateId();
    const res = await db.prepare('SELECT COUNT(*) as count FROM drive_accounts WHERE user_id = ?').bind(targetUserId).first<{ count: number }>();
    const isPrimary = (res && res.count === 0) ? 1 : 0;

    await db.prepare(
      'INSERT INTO drive_accounts (id, user_id, google_account_id, email, name, type, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(driveId, targetUserId, googleUser.id, googleUser.email, googleUser.name, 'oauth', isPrimary).run();
    drive = { id: driveId };
  }

  // Encrypt tokens before storing
  const encryptedTokens = await encrypt(JSON.stringify(tokens), env.TOKEN_ENCRYPTION_KEY);
  await env.KV.put(`tokens:${drive.id}`, encryptedTokens);

  const driveRow = await db.prepare('SELECT * FROM drive_accounts WHERE id = ?').bind(drive.id).first();
  if (driveRow) {
    const driveObj = mapDriveRow(driveRow as Record<string, unknown>);
    const driveService = new GoogleDriveService(env.KV, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.TOKEN_ENCRYPTION_KEY);
    c.executionCtx.waitUntil(syncDriveAccount(driveObj, db, env.KV, driveService));
  }

  return c.redirect(`${env.FRONTEND_URL}/`);
});

authRouter.get('/me', (c) => {
  return c.json({ user: c.get('session') });
});

authRouter.post('/logout', async (c) => {
  const sid = getCookie(c, 'omnidrive_sid');
  if (sid) {
    await c.env.KV.delete(`session:${sid}`);
  }
  deleteCookie(c, 'omnidrive_sid', { path: '/', secure: true, sameSite: 'None' });
  return c.json({ success: true });
});
