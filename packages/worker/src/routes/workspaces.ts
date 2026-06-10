import { Hono } from 'hono';
import type { AppContext } from '../types/env';
import { authGuard } from '../middleware/auth-guard';
import { generateId } from '../lib/id';
import { getWorkspaceRole, hasPermission } from '../middleware/rbac';
import { AuditService } from '../services/audit.service';

export const workspacesRouter = new Hono<AppContext>({ strict: false });

workspacesRouter.use('*', authGuard);

workspacesRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const { results } = await db
    .prepare(`
      SELECT w.*, wm.role 
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
      ORDER BY w.created_at DESC
    `)
    .bind(userId)
    .all();

  return c.json({ workspaces: results });
});

workspacesRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const { name } = await c.req.json<{ name?: string }>();

  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const workspaceId = generateId();
  const memberId = generateId();

  await db.batch([
    db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)')
      .bind(workspaceId, name, userId),
    db.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)')
      .bind(memberId, workspaceId, userId, 'owner')
  ]);

  const workspace = await db
    .prepare('SELECT * FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first();

  return c.json({ workspace }, 201);
});

workspacesRouter.post('/:id/members', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');
  const { email, role = 'viewer' } = await c.req.json<{ email?: string, role?: string }>();

  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const currentUserRole = await getWorkspaceRole(db, workspaceId, userId);
  if (!currentUserRole || !hasPermission(currentUserRole, 'manager')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Prevent role escalation: can't assign role >= own role
  const levels: Record<string, number> = { 'viewer': 1, 'auditor': 1, 'commenter': 2, 'editor': 3, 'manager': 4, 'owner': 5 };
  const assignerLevel = levels[currentUserRole] || 0;
  const targetLevel = levels[role] || 0;
  if (targetLevel >= assignerLevel) {
    return c.json({ error: 'Cannot assign a role equal to or higher than your own' }, 403);
  }

  const targetUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  const memberId = generateId();
  try {
    await db.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, workspaceId, targetUser.id, role).run();
    
    const auditService = new AuditService(db);
    await auditService.logEvent({
      workspaceId,
      actorId: userId,
      actionType: 'member.invite',
      resourceId: targetUser.id,
      resourceName: email,
      metadata: { role }
    });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'User is already a member' }, 409);
    }
    throw e;
  }

  return c.json({ success: true }, 201);
});

workspacesRouter.delete('/:id/members/:targetUserId', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');
  const targetUserId = c.req.param('targetUserId');

  if (userId === targetUserId) {
    return c.json({ error: 'Cannot remove yourself from the workspace' }, 400);
  }

  const currentUserRole = await getWorkspaceRole(db, workspaceId, userId);
  if (!currentUserRole || !hasPermission(currentUserRole, 'manager')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(workspaceId, targetUserId).run();

  const auditService = new AuditService(db);
  await auditService.logEvent({
    workspaceId,
    actorId: userId,
    actionType: 'member.remove',
    resourceId: targetUserId,
    metadata: { targetUserId }
  });

  return c.json({ success: true });
});

workspacesRouter.get('/:id/audit-logs', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || (role !== 'owner' && role !== 'manager' && role !== 'auditor')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await db.prepare(
    'SELECT a.*, u.email as actor_email FROM audit_logs a JOIN users u ON a.actor_id = u.id WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(workspaceId).all();

  return c.json({ logs: results });
});

workspacesRouter.get('/:id/policies', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, 'manager')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { results } = await db.prepare(
    'SELECT * FROM workspace_policies WHERE workspace_id = ?'
  ).bind(workspaceId).all();

  return c.json({ policies: results });
});

workspacesRouter.post('/:id/policies', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, 'manager')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { targetType, targetId, policyType, config } = await c.req.json<{
    targetType?: 'workspace' | 'folder';
    targetId?: string;
    policyType?: 'storage_quota' | 'data_retention';
    config?: any;
  }>();

  if (!targetType || !policyType || !config) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (policyType === 'storage_quota' && targetType !== 'workspace') {
    return c.json({ error: 'storage_quota must target a workspace' }, 400);
  }

  const policyId = generateId();

  await db.prepare(`
    INSERT INTO workspace_policies (id, workspace_id, target_type, target_id, policy_type, config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(policyId, workspaceId, targetType, targetId || null, policyType, JSON.stringify(config)).run();

  const policy = await db.prepare('SELECT * FROM workspace_policies WHERE id = ?').bind(policyId).first();

  return c.json({ policy }, 201);
});

workspacesRouter.delete('/:id/policies/:policyId', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');
  const policyId = c.req.param('policyId');

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, 'manager')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.prepare('DELETE FROM workspace_policies WHERE id = ? AND workspace_id = ?').bind(policyId, workspaceId).run();

  return c.json({ success: true });
});

workspacesRouter.patch('/:id/folders/:folderId/metadata', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const workspaceId = c.req.param('id');
  const folderId = c.req.param('folderId');
  const { metadata } = await c.req.json();

  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, 'editor')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.prepare('UPDATE workspace_folders SET metadata = ? WHERE id = ? AND workspace_id = ?').bind(JSON.stringify(metadata), folderId, workspaceId).run();

  return c.json({ success: true });
});
