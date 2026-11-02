import { Hono } from 'hono';
import type { AppContext } from '../types/env';
import { generateId } from '../lib/id';
import { authGuard } from '../middleware/auth-guard';
import { AppError } from '../middleware/error-handler';
import { mapAutomationRuleRow } from '../types/index';
import { IS_ACTIVE, IS_INACTIVE, TRIGGER_EVENT, TRIGGER_CRON, ACTION_MOVE, ACTION_DELETE } from '../services/automation.service';
import { getWorkspaceRole, hasPermission } from '../middleware/rbac';

export const automationsRouter = new Hono<AppContext>({ strict: false });
automationsRouter.use('*', authGuard);

interface AutomationRuleBody {
  name: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  conditions?: Record<string, unknown>[];
  actions?: Record<string, unknown>[];
}

automationsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare('SELECT * FROM automation_rules WHERE user_id = ?').bind(userId).all();
  
  return c.json({
    rules: results.map(mapAutomationRuleRow)
  });
});

const RULE_FIELDS = ['name', 'extension', 'mime_type'];
const RULE_OPERATORS = ['endswith', 'contains', 'equals'];

// Rules run unattended against every file the user owns, so reject anything the
// engine would misinterpret, and in particular a delete with no conditions,
// which would trash every file.
async function validateRule(db: D1Database, userId: string, triggerType: string, conditions: any[], actions: any[]) {
  if (![TRIGGER_EVENT, TRIGGER_CRON].includes(triggerType as any)) {
    throw new AppError(400, "trigger_type must be 'event' or 'cron'");
  }
  for (const cond of conditions) {
    if (!cond || !RULE_FIELDS.includes(cond.field) || !RULE_OPERATORS.includes(cond.operator) || typeof cond.value !== 'string' || !cond.value) {
      throw new AppError(400, `Each condition needs a field (${RULE_FIELDS.join(', ')}), an operator (${RULE_OPERATORS.join(', ')}) and a value`);
    }
  }
  if (actions.length === 0) throw new AppError(400, 'At least one action is required');
  for (const action of actions) {
    if (action?.type === ACTION_DELETE) {
      if (conditions.length === 0) throw new AppError(400, 'A delete action needs at least one condition');
    } else if (action?.type === ACTION_MOVE) {
      const folderId = action.targetFolderId;
      if (typeof folderId !== 'string' || !folderId) throw new AppError(400, 'A move action needs a targetFolderId');
      const folder = await db.prepare('SELECT workspace_id FROM workspace_folders WHERE id = ?').bind(folderId).first<{ workspace_id: string }>();
      if (!folder) throw new AppError(404, 'Target folder not found');
      const role = await getWorkspaceRole(db, folder.workspace_id, userId);
      if (!role || !hasPermission(role, 'editor')) throw new AppError(403, 'Editor access to the target workspace is required');
    } else {
      throw new AppError(400, "Action type must be 'move' or 'delete'");
    }
  }
}

automationsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<AutomationRuleBody>();
  
  if (!body.name || !body.trigger_type) {
    throw new AppError(400, 'name and trigger_type are required');
  }

  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const actions = Array.isArray(body.actions) ? body.actions : [];
  await validateRule(c.env.DB, userId, body.trigger_type, conditions, actions);
  
  const id = generateId();
  
  await c.env.DB.prepare(`
    INSERT INTO automation_rules (id, user_id, name, trigger_type, trigger_config, conditions, actions) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, body.name, body.trigger_type, 
    JSON.stringify(body.trigger_config || {}), 
    JSON.stringify(conditions), 
    JSON.stringify(actions)
  ).run();
  
  return c.json({ id, success: true }, 201);
});

automationsRouter.patch('/:id/toggle', async (c) => {
  const userId = c.get('userId');
  const ruleId = c.req.param('id');
  const body = await c.req.json<{ is_active: boolean }>();
  
  if (typeof body.is_active !== 'boolean') {
    throw new AppError(400, 'is_active must be a boolean');
  }
  
  const { meta } = await c.env.DB.prepare('UPDATE automation_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(body.is_active ? IS_ACTIVE : IS_INACTIVE, ruleId, userId).run();
    
  if (meta.changes === 0) {
    throw new AppError(404, 'Automation rule not found');
  }
    
  return c.json({ success: true });
});
