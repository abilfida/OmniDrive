import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, type TestEnv } from './helpers/app-harness';

// SigV4 itself is covered by s3-auth.test.ts; here the caller is taken from a test header.
vi.mock('../src/middleware/s3-auth', () => ({
  s3AuthMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set('userId', c.req.header('x-test-user'));
    c.set('s3WorkspaceId', null);
    await next();
  },
}));

describe('S3 API workspace roles', () => {
  let t: TestEnv;

  beforeEach(async () => {
    t = createTestEnv();
    await seedUser(t, 'editor');
    await seedUser(t, 'viewer');
    await t.db.batch([
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('ws-1', 'team', 'editor')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws-1', 'editor', 'editor')"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m2', 'ws-1', 'viewer', 'viewer')"),
      t.db.prepare("INSERT INTO drive_accounts (id, user_id, google_account_id, email) VALUES ('drive-e', 'editor', 'g', 'e@x')"),
      t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, workspace_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
                    VALUES ('f1', 'editor', 'drive-e', 'ws-1', 'gf1', 'a.txt', 'text/plain', 1, 't', 't')`),
    ]);
  });

  const s3 = (user: string, method: string, path: string, body?: string) =>
    app.request(path, { method, headers: { 'x-test-user': user, 'Content-Length': String(body?.length ?? 0) }, body }, t.env, t.ctx);

  it('denies object deletes to viewers and leaves the object untouched', async () => {
    const res = await s3('viewer', 'DELETE', '/s3/team/a.txt');
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('AccessDenied');
    const row = await t.db.prepare("SELECT is_trashed FROM files WHERE id = 'f1'").first();
    expect(row).toEqual({ is_trashed: 0 });
  });

  it('denies uploads and multipart uploads to viewers', async () => {
    expect((await s3('viewer', 'PUT', '/s3/team/b.txt', 'hello')).status).toBe(403);
    expect((await s3('viewer', 'POST', '/s3/team/b.txt?uploads')).status).toBe(403);
  });

  it('lets editors past the role check', async () => {
    const res = await s3('editor', 'DELETE', '/s3/team/missing.txt');
    expect(res.status).not.toBe(403);
  });

  it('still hides buckets from non-members', async () => {
    await seedUser(t, 'outsider');
    expect((await s3('outsider', 'DELETE', '/s3/team/a.txt')).status).toBe(404);
  });
});
