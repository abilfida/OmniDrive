import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, seedDrive, apiRequest, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

describe('share links and drive disconnect authorization', () => {
  let t: TestEnv;
  let alice: string;
  let mallory: string;

  beforeEach(async () => {
    t = createTestEnv();
    alice = await seedUser(t, 'alice');
    mallory = await seedUser(t, 'mallory');
    await seedDrive(t, 'drive-a', 'alice');
    await t.db.batch([
      t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
                    VALUES ('f1', 'alice', 'drive-a', 'gf1', 'report.pdf', 'application/pdf', 2048, 't', 't')`),
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-1', 'Team', 'alice')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws-1', 'alice', 'owner')"),
      t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-1', 'ws-1', 'Docs')"),
    ]);
  });

  it("refuses to share another workspace's folder", async () => {
    const res = await apiRequest(t, mallory, 'POST', '/api/shared', { targetType: 'folder', targetId: 'wf-1' });
    expect(res.status).toBe(403);
  });

  it('rejects unknown target types instead of skipping the ownership check', async () => {
    const res = await apiRequest(t, mallory, 'POST', '/api/shared', { targetType: 'workspace', targetId: 'ws-1' });
    expect(res.status).toBe(400);
  });

  it('public meta exposes only what the share page needs', async () => {
    const created = await apiRequest(t, alice, 'POST', '/api/shared', { targetType: 'file', targetId: 'f1', allowDownloads: false });
    expect(created.status).toBe(200);
    const { id } = await created.json() as any;

    const res = await app.request(`/api/shared/${id}/meta`, { headers: { Origin: FRONTEND_URL } }, t.env, t.ctx);
    expect(res.status).toBe(200);
    const meta = await res.json() as any;
    expect(meta).toEqual({
      type: 'file',
      target: { name: 'report.pdf', mimeType: 'application/pdf', size: 2048 },
      allowDownloads: false,
    });
  });

  it("disconnecting someone else's drive leaves their tokens alone", async () => {
    const res = await apiRequest(t, mallory, 'DELETE', '/api/drives/drive-a');
    expect(res.status).toBe(404);
    expect(await t.env.KV.get('tokens:drive-a')).not.toBeNull();
    expect(await t.db.prepare("SELECT id FROM drive_accounts WHERE id = 'drive-a'").first()).not.toBeNull();
  });

  it('the owner can disconnect their drive', async () => {
    const res = await apiRequest(t, alice, 'DELETE', '/api/drives/drive-a');
    expect(res.status).toBe(200);
    expect(await t.env.KV.get('tokens:drive-a')).toBeNull();
  });
});
