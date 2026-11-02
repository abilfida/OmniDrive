import type { RuleCondition, AutomationRule, RuleAction } from '../types/automation';
import type { Env } from '../types/env';

export const TRIGGER_EVENT: AutomationRule['triggerType'] = 'event';
export const TRIGGER_CRON: AutomationRule['triggerType'] = 'cron';
export const ACTION_MOVE: RuleAction['type'] = 'move';
export const ACTION_DELETE: RuleAction['type'] = 'delete';

export const IS_ACTIVE = 1;
export const IS_INACTIVE = 0;
export const IS_NOT_TRASHED = 0;
export const IS_TRASHED = 1;

export const BATCH_SIZE = 100;
// Files scanned per user per cron run. The position is kept in KV, so a large
// library is covered over several runs instead of exceeding per-run limits.
export const MAX_FILES_PER_RUN = 2000;
const LOG_RETENTION = '-30 days';
const cursorKey = (userId: string) => `automation:cursor:${userId}`;


export interface AutomationFile {
  name: string;
  extension: string;
  [key: string]: unknown;
}

export interface DbFile extends AutomationFile {
  id: string;
  user_id: string;
}

interface ParsedRule {
  id: string;
  userId: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export function evaluateCondition(file: AutomationFile, conditions: RuleCondition[]): boolean {
  if (!conditions || conditions.length === 0) return true;
  
  // Compute extension if missing
  const evalFile = { ...file };
  if (!evalFile.extension && evalFile.name) {
    const parts = evalFile.name.split('.');
    evalFile.extension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  return conditions.every(cond => {
    const rawFieldValue = evalFile[cond.field];
    const value = rawFieldValue != null ? String(rawFieldValue).toLowerCase() : '';
    const target = cond.value != null ? String(cond.value).toLowerCase() : '';
    
    switch (cond.operator) {
      case 'endswith': return value.endsWith(target);
      case 'contains': return value.includes(target);
      case 'equals': return value === target;
      default: return false;
    }
  });
}

function parseRule(row: Record<string, unknown>): ParsedRule | null {
  try {
    const conditions = JSON.parse((row.conditions as string) || '[]') as RuleCondition[];
    const actions = JSON.parse((row.actions as string) || '[]') as RuleAction[];
    return {
      id: row.id as string,
      userId: row.user_id as string,
      conditions,
      actions
    };
  } catch (error) {
    return null; // Skip malformed rules
  }
}

export class AutomationEngine {
  constructor(private env: Env) {}

  async processEventTrigger(file: DbFile, ctx: ExecutionContext) {
    const db = this.env.DB;
    const { results } = await db.prepare(
      `SELECT * FROM automation_rules WHERE trigger_type = ? AND is_active = ? AND user_id = ?`
    ).bind(TRIGGER_EVENT, IS_ACTIVE, file.user_id).all();

    for (const row of results) {
      const rule = parseRule(row as Record<string, unknown>);
      if (rule && evaluateCondition(file, rule.conditions)) {
        ctx.waitUntil(this.executeActions(rule.id, file, rule.actions));
      }
    }
  }

  async processCronTrigger(_ctx: ExecutionContext) {
    const db = this.env.DB;
    // Without pruning, automation_logs grew by a row per matching file per run.
    await db.prepare("DELETE FROM automation_logs WHERE executed_at < datetime('now', ?)").bind(LOG_RETENTION).run();

    const { results } = await db.prepare(
      `SELECT * FROM automation_rules WHERE trigger_type = ? AND is_active = ?`
    ).bind(TRIGGER_CRON, IS_ACTIVE).all();

    // Group rules by user_id
    const rulesByUser = new Map<string, ParsedRule[]>();
    for (const row of results) {
      const rule = parseRule(row as Record<string, unknown>);
      if (rule) {
        const userRules = rulesByUser.get(rule.userId) || [];
        userRules.push(rule);
        rulesByUser.set(rule.userId, userRules);
      }
    }

    for (const [userId, rules] of rulesByUser.entries()) {
      // Keyset pagination: OFFSET skipped rows whenever an action trashed files
      // that the next page's offset still counted.
      let after = (await this.env.KV.get(cursorKey(userId))) ?? '';
      let scanned = 0;

      while (scanned < MAX_FILES_PER_RUN) {
        const { results: files } = await db.prepare(
          `SELECT * FROM files WHERE user_id = ? AND is_trashed = ? AND id > ? ORDER BY id LIMIT ?`
        ).bind(userId, IS_NOT_TRASHED, after, BATCH_SIZE).all();

        for (const file of files) {
          for (const rule of rules) {
            if (evaluateCondition(file as unknown as DbFile, rule.conditions)) {
              await this.executeActions(rule.id, file as unknown as DbFile, rule.actions);
            }
          }
        }

        scanned += files.length;
        if (files.length < BATCH_SIZE) {
          after = ''; // reached the end: the next run starts from the beginning
          break;
        }
        after = (files[files.length - 1] as { id: string }).id;
      }

      if (after) await this.env.KV.put(cursorKey(userId), after);
      else await this.env.KV.delete(cursorKey(userId));
    }
  }

  private async executeActions(ruleId: string, file: DbFile, actions: RuleAction[]) {
    try {
      const stmts: D1PreparedStatement[] = [];
      const current = file as DbFile & { workspace_folder_id?: string | null; is_trashed?: number };

      // Only actions that would change the file are applied, so a rule doesn't
      // redo (and re-log) the same work for every matching file on every run.
      for (const action of actions) {
        const targetFolderId = action.targetFolderId ?? (action as any).target_folder_id;

        if (action.type === ACTION_MOVE && targetFolderId && current.workspace_folder_id !== targetFolderId) {
          stmts.push(
            this.env.DB.prepare(
              `UPDATE files SET workspace_folder_id = ?,
                 workspace_id = (SELECT workspace_id FROM workspace_folders WHERE id = ?),
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND EXISTS (SELECT 1 FROM workspace_folders WHERE id = ?)`
            ).bind(targetFolderId as string, targetFolderId as string, file.id, targetFolderId as string)
          );
        } else if (action.type === ACTION_DELETE && current.is_trashed !== IS_TRASHED) {
          stmts.push(
            this.env.DB.prepare('UPDATE files SET is_trashed = ? WHERE id = ?')
              .bind(IS_TRASHED, file.id)
          );
        }
      }

      if (stmts.length > 0) {
        stmts.push(
          this.env.DB.prepare('INSERT INTO automation_logs (id, rule_id, status, details) VALUES (?, ?, ?, ?)')
            .bind(crypto.randomUUID(), ruleId, 'success', JSON.stringify({ fileId: file.id }))
        );
      }

      if (stmts.length > 0) {
        await this.env.DB.batch(stmts);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.env.DB.prepare('INSERT INTO automation_logs (id, rule_id, status, details) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), ruleId, 'error', errorMessage).run();
    }
  }
}
