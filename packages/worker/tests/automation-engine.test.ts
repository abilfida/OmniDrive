import { describe, it, expect, beforeEach } from 'vitest';
import { AutomationEngine } from '../src/services/automation.service';
import { createTestEnv, seedUser, apiRequest, type TestEnv } from './helpers/app-harness';

const pdfToDocs = { conditions: [{ field: 'name', operator: 'endswith', value: '.pdf' }], actions: [{ type: 'move', targetFolderId: 'wf-docs' }] };

describe('automation engine', () => {
  let t: TestEnv;
  let sid: string;

  beforeEach(async () => {
    t = createTestEnv();
    sid = await seedUser(t, 'u1');
    await t.db.batch([
      t.db.prepare("INSERT INTO drive_accounts (id, user_id, google_account_id, email) VALUES ('d1', 'u1', 'g', 'a@x')"),
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws', 'Team', 'u1')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws', 'u1', 'owner')"),
      t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-docs', 'ws', 'Docs')"),
      ...['a.pdf', 'b.pdf', 'c.txt'].map((name, i) => t.db.prepare(
        `INSERT INTO files (id, user_id, drive_account_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
         VALUES (?, 'u1', 'd1', ?, ?, 'x', 1, 't', 't')`).bind(`f${i}`, `g${i}`, name)),
      t.db.prepare(`INSERT INTO automation_rules (id, user_id, name, trigger_type, conditions, actions)
                    VALUES ('r1', 'u1', 'PDFs to Docs', 'cron', ?, ?)`).bind(JSON.stringify(pdfToDocs.conditions), JSON.stringify(pdfToDocs.actions)),
    ]);
  });

  const runCron = () => new AutomationEngine(t.env).processCronTrigger(t.ctx);
  const logCount = async () => (await t.db.prepare('SELECT COUNT(*) AS n FROM automation_logs').first<any>()).n;

  it('moves matching files into the folder and its workspace', async () => {
    await runCron();
    const rows = (await t.db.prepare('SELECT name, workspace_id, workspace_folder_id FROM files ORDER BY name').all()).results;
    expect(rows).toEqual([
      { name: 'a.pdf', workspace_id: 'ws', workspace_folder_id: 'wf-docs' },
      { name: 'b.pdf', workspace_id: 'ws', workspace_folder_id: 'wf-docs' },
      { name: 'c.txt', workspace_id: null, workspace_folder_id: null },
    ]);
    expect(await logCount()).toBe(2);
  });

  it('does nothing (and logs nothing) for files already handled on later runs', async () => {
    await runCron();
    await runCron();
    await runCron();
    expect(await logCount()).toBe(2);
  });

  it('prunes automation logs older than 30 days', async () => {
    await t.db.prepare("INSERT INTO automation_logs (id, rule_id, status, executed_at) VALUES ('old', 'r1', 'success', datetime('now', '-31 days'))").run();
    await runCron();
    expect(await t.db.prepare("SELECT id FROM automation_logs WHERE id = 'old'").first()).toBeNull();
  });

  describe('rule validation', () => {
    const create = (body: Record<string, unknown>) =>
      apiRequest(t, sid, 'POST', '/api/automations', { name: 'Rule', trigger_type: 'cron', ...body });

    it('accepts a well-formed rule', async () => {
      expect((await create(pdfToDocs)).status).toBe(201);
    });

    it('rejects a delete rule without conditions, which would trash every file', async () => {
      expect((await create({ conditions: [], actions: [{ type: 'delete' }] })).status).toBe(400);
    });

    it('rejects unknown actions, operators and missing targets', async () => {
      expect((await create({ conditions: pdfToDocs.conditions, actions: [] })).status).toBe(400);
      expect((await create({ conditions: pdfToDocs.conditions, actions: [{ type: 'shred' }] })).status).toBe(400);
      expect((await create({ conditions: [{ field: 'name', operator: 'regex', value: '.*' }], actions: pdfToDocs.actions })).status).toBe(400);
      expect((await create({ conditions: pdfToDocs.conditions, actions: [{ type: 'move' }] })).status).toBe(400);
    });

    it("rejects moving files into a workspace folder the user can't edit", async () => {
      await seedUser(t, 'other');
      await t.db.batch([
        t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-x', 'X', 'other')"),
        t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-x', 'ws-x', 'X')"),
      ]);
      expect((await create({ conditions: pdfToDocs.conditions, actions: [{ type: 'move', targetFolderId: 'wf-x' }] })).status).toBe(403);
    });
  });
});
