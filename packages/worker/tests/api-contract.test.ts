import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, seedDrive, apiRequest, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

describe('API contract used by the web app', () => {
  let t: TestEnv;
  let sid: string;

  beforeEach(async () => {
    t = createTestEnv();
    sid = await seedUser(t, 'u1');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('allows PUT in CORS preflight (folder rename, shared link edit)', async () => {
    const res = await app.request('/api/folders/abc', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_URL, 'Access-Control-Request-Method': 'PUT' },
    }, t.env, t.ctx);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });

  describe('PATCH /api/files/:id/rename', () => {
    beforeEach(async () => {
      await seedDrive(t, 'drive-a', 'u1');
      await t.db.prepare(
        `INSERT INTO files (id, user_id, drive_account_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
         VALUES ('f1', 'u1', 'drive-a', 'gfile-1', 'old.txt', 'text/plain', 1, '2026-01-01', '2026-01-01')`
      ).run();
    });

    it('renames the file in Google Drive and in the database', async () => {
      const calls: { url: string; method?: string; body?: string }[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method, body: init?.body as string });
        return Response.json({ id: 'gfile-1', name: 'new.txt' });
      }));

      const res = await apiRequest(t, sid, 'PATCH', '/api/files/f1/rename', { name: 'new.txt' });
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('/drive/v3/files/gfile-1');
      expect(calls[0].method).toBe('PATCH');
      expect(JSON.parse(calls[0].body!)).toEqual({ name: 'new.txt' });
      const row = await t.db.prepare('SELECT name FROM files WHERE id = ?').bind('f1').first();
      expect(row).toEqual({ name: 'new.txt' });
    });

    it("returns 404 for a file the user doesn't own", async () => {
      const otherSid = await seedUser(t, 'u2');
      const res = await apiRequest(t, otherSid, 'PATCH', '/api/files/f1/rename', { name: 'x.txt' });
      expect(res.status).toBe(404);
    });

    it('rejects an empty name', async () => {
      const res = await apiRequest(t, sid, 'PATCH', '/api/files/f1/rename', { name: '   ' });
      expect(res.status).toBe(400);
    });
  });

  it('returns workspace policies in camelCase', async () => {
    await t.db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').bind('ws-1', 'Team', 'u1').run();
    await t.db.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)').bind('m1', 'ws-1', 'u1', 'owner').run();

    const created = await apiRequest(t, sid, 'POST', '/api/workspaces/ws-1/policies', {
      targetType: 'workspace', policyType: 'storage_quota', config: { max_bytes: 1024 },
    });
    expect(created.status).toBe(201);
    expect((await created.json() as any).policy).toMatchObject({ policyType: 'storage_quota', targetType: 'workspace', workspaceId: 'ws-1' });

    const list = await apiRequest(t, sid, 'GET', '/api/workspaces/ws-1/policies');
    const { policies } = await list.json() as any;
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({ policyType: 'storage_quota', targetType: 'workspace', targetId: null });
    expect(JSON.parse(policies[0].config)).toEqual({ max_bytes: 1024 });
    expect(policies[0].policy_type).toBeUndefined();
  });
});
