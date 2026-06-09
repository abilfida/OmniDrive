import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import * as bcrypt from 'bcryptjs';
import type { AppContext, SessionData } from '../types/env';
import { AuthService } from '../services/auth.service';
import { AppError } from '../middleware/error-handler';
import { generateId } from '../lib/id';
import { authGuard } from '../middleware/auth-guard';

export const authRouter = new Hono<AppContext>({ strict: false });

authRouter.get('/setup-status', async (c) => {
  const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  return c.json({ isSetup: (result?.count || 0) > 0 });
});

authRouter.post('/register', async (c) => {
  const { username, password, email, invitation_code } = await c.req.json();
  if (!username || !password) throw new AppError(400, 'Username and password required');

  const db = c.env.DB;
  
  // Check setup status
  const setupRes = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const isSetup = (setupRes?.count || 0) > 0;

  if (isSetup) {
    if (!invitation_code) throw new AppError(400, 'Invitation code required');
    const inv = await db.prepare('SELECT id, max_uses, used_count FROM invitation_codes WHERE code = ?').bind(invitation_code).first<{ id: string, max_uses: number, used_count: number }>();
    if (!inv) throw new AppError(400, 'Invalid invitation code');
    if (inv.max_uses > 0 && inv.used_count >= inv.max_uses) throw new AppError(400, 'Invitation code has reached its usage limit');
    
    await db.prepare('UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?').bind(inv.id).run();
  }

  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) throw new AppError(400, 'Username already exists');

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);
  const isSuperAdmin = isSetup ? 0 : 1;
  
  await db.prepare(
    'INSERT INTO users (id, username, password_hash, email, name, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, username, passwordHash, email || null, username, isSuperAdmin).run();

  const sessionData: SessionData = { userId: id, username, email: email || null, name: username, avatarUrl: null, role: isSuperAdmin ? 'super_admin' : 'member' };
  const sessionId = generateId();
  
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  setCookie(c, 'omnidrive_sid', sessionId, { path: '/', secure: true, httpOnly: true, sameSite: 'None', maxAge: 60 * 60 * 24 * 7 });

  return c.json({ success: true, user: sessionData, isSuperAdmin: !!isSuperAdmin });
});

authRouter.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) throw new AppError(400, 'Username and password required');

  const user = await c.env.DB.prepare('SELECT id, username, password_hash, email, name, avatar_url, is_super_admin FROM users WHERE username = ?').bind(username).first<any>();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'Invalid credentials');
  }

  const sessionData: SessionData = { userId: user.id, username: user.username, email: user.email, name: user.name, avatarUrl: user.avatar_url, role: user.is_super_admin ? 'super_admin' : 'member' };
  const sessionId = generateId();
  
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  setCookie(c, 'omnidrive_sid', sessionId, { path: '/', secure: true, httpOnly: true, sameSite: 'None', maxAge: 60 * 60 * 24 * 7 });

  return c.json({ success: true, user: sessionData });
});

// Protected routes below
authRouter.use('*', authGuard);

authRouter.get('/google', (c) => {
  const env = c.env;
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
  setCookie(c, 'oauth_state', state, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 5 });
  authUrl.searchParams.append('state', state);

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

  const env = c.env;
  const redirectUri = `${env.WORKER_URL}/api/auth/callback`;
  const authService = new AuthService(env);

  const tokens = await authService.exchangeCodeForTokens(code, redirectUri);
  const googleUser = await authService.fetchUserInfo(tokens.accessToken);

  // User MUST be logged in to reach here (authGuard enforces this)
  const targetUserId = c.get('userId'); 
  const db = env.DB;

  // Link google account to local user
  await db.prepare('UPDATE users SET google_id = ?, email = COALESCE(email, ?), name = COALESCE(name, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
    .bind(googleUser.id, googleUser.email, googleUser.name, googleUser.picture, targetUserId).run();

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
  await env.KV.put(`tokens:${drive.id}`, JSON.stringify(tokens));

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
