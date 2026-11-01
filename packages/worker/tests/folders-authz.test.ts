import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEnv, seedUser, apiRequest, type TestEnv } from './helpers/app-harness';

describe('folders router authorization', () => {
  let t: TestEnv;
  let owner: string;
  let outsider: string;
  let viewer: string;

  beforeEach(async () => {
    t = createTestEnv();
    owner = await seedUser(t, 'owner');
    outsider = await seedUser(t, 'outsider');
    viewer = await seedUser(t, 'viewer');
    await t.db.batch([
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-1', 'Team', 'owner')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws-1', 'owner', 'owner')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m2', 'ws-1', 'viewer', 'viewer')"),
      t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-1', 'ws-1', 'Docs')"),
      t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name, parent_id) VALUES ('wf-2', 'ws-1', 'Sub', 'wf-1')"),
    ]);
  });

  const folder = (id: string) => t.db.prepare('SELECT name, parent_id, is_starred FROM workspace_folders WHERE id = ?').bind(id).first<any>();
  const workspaceName = async () => (await t.db.prepare("SELECT name FROM workspaces WHERE id = 'ws-1'").first<any>())?.name;

  describe('non-members get 404 and change nothing', () => {
    it('cannot list a folder', async () => {
      expect((await apiRequest(t, outsider, 'GET', '/api/folders/wf-1')).status).toBe(404);
    });

    it('cannot rename a workspace or a folder', async () => {
      expect((await apiRequest(t, outsider, 'PUT', '/api/folders/ws-1', { name: 'pwned' })).status).toBe(404);
      expect((await apiRequest(t, outsider, 'PUT', '/api/folders/wf-1', { name: 'pwned' })).status).toBe(404);
      expect(await workspaceName()).toBe('Team');
      expect((await folder('wf-1')).name).toBe('Docs');
    });

    it('cannot create, delete or star folders', async () => {
      expect((await apiRequest(t, outsider, 'POST', '/api/folders', { name: 'x', parentId: 'ws-1' })).status).toBe(404);
      expect((await apiRequest(t, outsider, 'DELETE', '/api/folders/wf-1')).status).toBe(404);
      expect((await apiRequest(t, outsider, 'POST', '/api/folders/wf-1/star')).status).toBe(404);
      expect(await folder('wf-1')).toMatchObject({ name: 'Docs', is_starred: 0 });
    });

    it('cannot move files into the workspace or trigger its sync', async () => {
      expect((await apiRequest(t, outsider, 'POST', '/api/folders/wf-1/files', { fileIds: ['f1'] })).status).toBe(404);
      expect((await apiRequest(t, outsider, 'POST', '/api/folders/wf-1/force-sync')).status).toBe(404);
    });
  });

  describe('viewers can read but not write', () => {
    it('can list a folder', async () => {
      expect((await apiRequest(t, viewer, 'GET', '/api/folders/wf-1')).status).toBe(200);
    });

    it('cannot rename or delete', async () => {
      expect((await apiRequest(t, viewer, 'PUT', '/api/folders/wf-1', { name: 'nope' })).status).toBe(403);
      expect((await apiRequest(t, viewer, 'DELETE', '/api/folders/wf-1')).status).toBe(403);
      expect((await folder('wf-1')).name).toBe('Docs');
    });
  });

  describe('members with enough access', () => {
    it('can rename the workspace and folders', async () => {
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/ws-1', { name: 'Team 2' })).status).toBe(200);
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/wf-1', { name: 'Docs 2' })).status).toBe(200);
      expect(await workspaceName()).toBe('Team 2');
      expect((await folder('wf-1')).name).toBe('Docs 2');
    });

    it('cannot move a folder into itself or its own subfolder', async () => {
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/wf-1', { parentId: 'wf-1' })).status).toBe(400);
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/wf-1', { parentId: 'wf-2' })).status).toBe(400);
      expect((await folder('wf-1')).parent_id).toBeNull();
    });

    it('cannot move a folder into another workspace', async () => {
      await t.db.batch([
        t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-2', 'Other', 'owner')"),
        t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m3', 'ws-2', 'owner', 'owner')"),
        t.db.prepare("INSERT INTO workspace_folders (id, workspace_id, name) VALUES ('wf-x', 'ws-2', 'X')"),
      ]);
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/wf-1', { parentId: 'wf-x' })).status).toBe(400);
    });

    it('can move a folder back to the workspace root', async () => {
      expect((await apiRequest(t, owner, 'PUT', '/api/folders/wf-2', { parentId: 'ws-1' })).status).toBe(200);
      expect((await folder('wf-2')).parent_id).toBeNull();
    });

    it('can create, star and delete folders', async () => {
      const created = await apiRequest(t, owner, 'POST', '/api/folders', { name: 'New', parentId: 'wf-1' });
      expect(created.status).toBe(200);
      expect((await apiRequest(t, owner, 'POST', '/api/folders/wf-1/star')).status).toBe(200);
      expect((await folder('wf-1')).is_starred).toBe(1);
      expect((await apiRequest(t, owner, 'DELETE', '/api/folders/wf-2')).status).toBe(200);
      expect(await folder('wf-2')).toBeNull();
    });
  });
});
