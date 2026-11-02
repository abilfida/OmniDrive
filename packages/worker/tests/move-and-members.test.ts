import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEnv, seedUser, apiRequest, type TestEnv } from './helpers/app-harness';

describe('moving files into workspaces', () => {
  let t: TestEnv;
  let alice: string;

  beforeEach(async () => {
    t = createTestEnv();
    alice = await seedUser(t, 'alice');
    await seedUser(t, 'victim');
    await t.db.batch([
      t.db.prepare("INSERT INTO drive_accounts (id, user_id, google_account_id, email) VALUES ('d1', 'alice', 'g', 'a@x')"),
      t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
                    VALUES ('f1', 'alice', 'd1', 'gf1', 'a.txt', 'text/plain', 1, 't', 't')`),
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-mine', 'Mine', 'alice'), ('ws-other', 'Other', 'victim')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws-mine', 'alice', 'owner'), ('m2', 'ws-other', 'victim', 'owner')"),
      t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-mine', 'ws-mine', 'Docs'), ('wf-other', 'ws-other', 'Docs')"),
    ]);
  });

  const placement = () => t.db.prepare("SELECT workspace_id, workspace_folder_id FROM files WHERE id = 'f1'").first();

  it('moves a file into a workspace folder the user can edit (the field the web app sends)', async () => {
    const res = await apiRequest(t, alice, 'PATCH', '/api/files/f1/move', { workspaceFolderId: 'wf-mine' });
    expect(res.status).toBe(200);
    expect(await placement()).toEqual({ workspace_id: 'ws-mine', workspace_folder_id: 'wf-mine' });
  });

  it("refuses to inject a file into someone else's workspace", async () => {
    const res = await apiRequest(t, alice, 'PATCH', '/api/files/f1/move', { workspaceFolderId: 'wf-other' });
    expect(res.status).toBe(403);
    expect(await placement()).toEqual({ workspace_id: null, workspace_folder_id: null });
  });

  it('removes a file from its workspace with null', async () => {
    await apiRequest(t, alice, 'PATCH', '/api/files/f1/move', { workspaceFolderId: 'wf-mine' });
    const res = await apiRequest(t, alice, 'PATCH', '/api/files/f1/move', { workspaceFolderId: null });
    expect(res.status).toBe(200);
    expect(await placement()).toEqual({ workspace_id: null, workspace_folder_id: null });
  });

  it("returns 404 for another user's file", async () => {
    const mallory = await seedUser(t, 'mallory');
    expect((await apiRequest(t, mallory, 'PATCH', '/api/files/f1/move', { workspaceFolderId: null })).status).toBe(404);
  });
});

describe('removing workspace members', () => {
  let t: TestEnv;
  const sids: Record<string, string> = {};

  beforeEach(async () => {
    t = createTestEnv();
    for (const u of ['owner', 'mgr1', 'mgr2', 'editor']) sids[u] = await seedUser(t, u);
    await t.db.batch([
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws', 'Team', 'owner')"),
      t.db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES
        ('m0', 'ws', 'owner', 'owner'), ('m1', 'ws', 'mgr1', 'manager'), ('m2', 'ws', 'mgr2', 'manager'), ('m3', 'ws', 'editor', 'editor')`),
    ]);
  });

  const isMember = async (u: string) => !!(await t.db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id = 'ws' AND user_id = ?").bind(u).first());

  it('lets a manager remove members below them', async () => {
    expect((await apiRequest(t, sids.mgr1, 'DELETE', '/api/workspaces/ws/members/editor')).status).toBe(200);
    expect(await isMember('editor')).toBe(false);
  });

  it('stops a manager from removing the owner or another manager', async () => {
    expect((await apiRequest(t, sids.mgr1, 'DELETE', '/api/workspaces/ws/members/owner')).status).toBe(403);
    expect((await apiRequest(t, sids.mgr1, 'DELETE', '/api/workspaces/ws/members/mgr2')).status).toBe(403);
    expect(await isMember('owner')).toBe(true);
    expect(await isMember('mgr2')).toBe(true);
  });

  it('lets the owner remove a manager', async () => {
    expect((await apiRequest(t, sids.owner, 'DELETE', '/api/workspaces/ws/members/mgr2')).status).toBe(200);
  });
});
