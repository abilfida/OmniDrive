import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, ENCRYPTION_KEY, type TestEnv } from './helpers/app-harness';
import { encrypt } from '../src/lib/crypto';

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

  it('stores the decoded bytes of an aws-chunked PutObject (current AWS SDK default)', async () => {
    await t.db.prepare("UPDATE drive_accounts SET total_quota = 1000000 WHERE id = 'drive-e'").run();
    await t.env.KV.put('tokens:drive-e', await encrypt(JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }), ENCRYPTION_KEY));
    let uploaded = '';
    let uploadLength: string | null = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('uploadType=resumable')) return new Response(null, { headers: { Location: 'https://upload.test/session' } });
      if (url === 'https://upload.test/session') {
        uploadLength = new Headers(init?.headers).get('Content-Length');
        uploaded = await new Response(init?.body as BodyInit).text();
        return Response.json({ id: 'g-new', name: 'b.txt', mimeType: 'text/plain', size: String(uploaded.length), createdTime: 't', modifiedTime: 't' });
      }
      return Response.json({});
    }));

    const body = '5;chunk-signature=aa\r\nhello\r\n6;chunk-signature=bb\r\n world\r\n0;chunk-signature=cc\r\n\r\n';
    const res = await app.request('/s3/team/b.txt', {
      method: 'PUT',
      headers: {
        'x-test-user': 'editor',
        'Content-Length': String(body.length),
        'x-amz-content-sha256': 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD',
        'x-amz-decoded-content-length': '11',
      },
      body,
    }, t.env, t.ctx);
    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(uploaded).toBe('hello world');
    expect(uploadLength).toBe('11');
    expect(await t.db.prepare("SELECT size FROM files WHERE name = 'b.txt'").first()).toEqual({ size: 11 });
  });
});
