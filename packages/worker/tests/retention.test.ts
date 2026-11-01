import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolicyService } from '../src/services/policy.service';
import { GoogleDriveService } from '../src/services/google-drive';
import { createTestEnv, seedUser, seedDrive, apiRequest, ENCRYPTION_KEY, type TestEnv } from './helpers/app-harness';

describe('data retention', () => {
  let t: TestEnv;
  let sid: string;
  let googleCalls: { url: string; body?: string }[];

  beforeEach(async () => {
    t = createTestEnv();
    sid = await seedUser(t, 'u1');
    await seedDrive(t, 'drive-a', 'u1');
    await t.db.batch([
      t.db.prepare("INSERT INTO workspaces (id, name, owner_id, used_bytes) VALUES ('ws-1', 'Team', 'u1', 300)"),
      t.db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m1', 'ws-1', 'u1', 'owner')"),
      t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, workspace_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at, created_at)
                    VALUES ('old', 'u1', 'drive-a', 'ws-1', 'g-old', 'old.txt', 'text/plain', 100, 't', 't', datetime('now', '-40 days'))`),
      t.db.prepare(`INSERT INTO files (id, user_id, drive_account_id, workspace_id, google_file_id, name, mime_type, size, google_created_at, google_modified_at, created_at)
                    VALUES ('new', 'u1', 'drive-a', 'ws-1', 'g-new', 'new.txt', 'text/plain', 200, 't', 't', datetime('now', '-29 days', '-23 hours'))`),
    ]);
    googleCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      googleCalls.push({ url: String(input), body: init?.body as string });
      return Response.json({});
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = () => new PolicyService(t.env.DB).processAutoDeleteRetentionPolicies(
    new GoogleDriveService(t.env.KV, 'id', 'secret', ENCRYPTION_KEY)
  );
  const addPolicy = (id: string, config: string) =>
    t.db.prepare("INSERT INTO workspace_policies (id, workspace_id, target_type, policy_type, config) VALUES (?, 'ws-1', 'workspace', 'data_retention', ?)").bind(id, config).run();

  it('trashes expired files in Google Drive before removing them, and frees workspace quota', async () => {
    await addPolicy('p1', JSON.stringify({ action: 'auto_delete', days: 30 }));

    await run();

    expect(googleCalls).toHaveLength(1);
    expect(googleCalls[0].url).toContain('/files/g-old');
    expect(JSON.parse(googleCalls[0].body!)).toEqual({ trashed: true });
    const ids = (await t.db.prepare('SELECT id FROM files ORDER BY id').all()).results;
    expect(ids).toEqual([{ id: 'new' }]);
    expect(await t.db.prepare("SELECT used_bytes FROM workspaces WHERE id = 'ws-1'").first()).toEqual({ used_bytes: 200 });
  });

  it('keeps the row when Google refuses the delete, so DB and Drive stay consistent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    await addPolicy('p1', JSON.stringify({ action: 'auto_delete', days: 30 }));

    await run();

    expect((await t.db.prepare('SELECT COUNT(*) AS n FROM files').first<any>()).n).toBe(2);
  });

  it('skips a malformed policy without stopping the others', async () => {
    await addPolicy('p0', JSON.stringify({ action: 'auto_delete' }));
    await addPolicy('p1', JSON.stringify({ action: 'auto_delete', days: 30 }));

    await run();

    expect((await t.db.prepare("SELECT id FROM files WHERE id = 'old'").first())).toBeNull();
  });

  it('rejects invalid policy configs when they are created', async () => {
    const create = (policyType: string, config: unknown) =>
      apiRequest(t, sid, 'POST', '/api/workspaces/ws-1/policies', { targetType: 'workspace', policyType, config });

    expect((await create('data_retention', { action: 'auto_delete' })).status).toBe(400);
    expect((await create('data_retention', { action: 'auto_delete', days: -1 })).status).toBe(400);
    expect((await create('data_retention', { action: 'shred', days: 5 })).status).toBe(400);
    expect((await create('storage_quota', {})).status).toBe(400);
    expect((await create('storage_quota', { max_bytes: 1024 })).status).toBe(201);
    expect((await create('data_retention', { action: 'auto_delete', days: 30 })).status).toBe(201);
  });
});
