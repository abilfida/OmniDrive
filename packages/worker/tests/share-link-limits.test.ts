import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, seedDrive, apiRequest, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

describe('share link limits', () => {
  let t: TestEnv;
  let owner: string;

  beforeEach(async () => {
    t = createTestEnv();
    owner = await seedUser(t, 'owner');
    await seedDrive(t, 'drive-a', 'owner');
    await t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at)
                        VALUES ('f1', 'owner', 'drive-a', 'gf1', 'a.txt', 'text/plain', 5, 't', 't')`).run();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('hello', { headers: { 'Content-Type': 'text/plain' } })));
  });
  afterEach(() => vi.unstubAllGlobals());

  const create = async (body: Record<string, unknown>) => {
    const res = await apiRequest(t, owner, 'POST', '/api/shared', { targetType: 'file', targetId: 'f1', ...body });
    return { status: res.status, id: res.status === 200 ? (await res.json() as any).id as string : null };
  };
  const visitor = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { Origin: FRONTEND_URL, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) } }, t.env, t.ctx);

  it('rejects an expiry date that cannot be parsed instead of creating a link that never expires', async () => {
    expect((await create({ expiresAt: 'next tuesday' })).status).toBe(400);
  });

  it('treats an unparseable stored expiry as expired', async () => {
    const { id } = await create({});
    await t.db.prepare("UPDATE shared_links SET expires_at = 'garbage' WHERE id = ?").bind(id).run();
    expect((await visitor(`/api/shared/${id}/meta`)).status).toBe(410);
  });

  it('rejects a non-positive download limit', async () => {
    expect((await create({ maxDownloads: 0 })).status).toBe(400);
    expect((await create({ maxDownloads: 'lots' })).status).toBe(400);
  });

  it('never serves more downloads than the limit, even concurrently', async () => {
    const { id } = await create({ maxDownloads: 1 });
    const statuses = (await Promise.all([1, 2, 3].map(() => visitor(`/api/shared/${id}/download`)))).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect((await t.db.prepare('SELECT download_count AS n FROM shared_links WHERE id = ?').bind(id).first<any>()).n).toBe(1);
  });

  it('signs visitors out of a protected link when its password changes', async () => {
    const { id } = await create({ password: 'first-pass' });
    const verified = await visitor(`/api/shared/${id}/verify`, { method: 'POST', body: JSON.stringify({ password: 'first-pass' }) });
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get('Set-Cookie')!.split(';')[0];

    expect((await visitor(`/api/shared/${id}/meta`, { headers: { Cookie: cookie } })).status).toBe(200);

    expect((await apiRequest(t, owner, 'PUT', `/api/shared/${id}`, { password: 'second-pass' })).status).toBe(200);
    const after = await visitor(`/api/shared/${id}/meta`, { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });
});
