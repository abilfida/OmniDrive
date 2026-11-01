import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEnv, seedUser, seedDrive, apiRequest, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

const ROOT_ID = 'google-root-id';

type InitCall = { authorization: string | null; origin: string | null; body: any };

function mockGoogle(initCalls: InitCall[], files: Record<string, { parents: string[]; size?: string }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')) {
      initCalls.push({
        authorization: headers.get('Authorization'),
        origin: headers.get('Origin'),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(null, { status: 200, headers: { Location: 'https://upload.example/session-1' } });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/root?')) {
      return Response.json({ id: ROOT_ID });
    }
    const match = url.match(/drive\/v3\/files\/([^?/]+)\?/);
    if (match && files[match[1]]) {
      const f = files[match[1]];
      return Response.json({
        id: match[1], name: 'report.pdf', mimeType: 'application/pdf', size: f.size ?? '100',
        parents: f.parents, createdTime: '2026-11-01T00:00:00Z', modifiedTime: '2026-11-01T00:00:00Z',
      });
    }
    return new Response('unexpected request ' + url, { status: 500 });
  });
}

describe('web upload flow', () => {
  let t: TestEnv;
  let sid: string;
  let initCalls: InitCall[];
  const googleFiles: Record<string, { parents: string[]; size?: string }> = {
    'gfile-root': { parents: [ROOT_ID] },
    'gfile-folder': { parents: ['gfolder-1'] },
  };

  beforeEach(async () => {
    t = createTestEnv();
    sid = await seedUser(t, 'u1');
    await seedDrive(t, 'drive-a', 'u1', { totalQuota: 10_000, usedQuota: 0 });
    await seedDrive(t, 'drive-b', 'u1', { totalQuota: 10_000, usedQuota: 5_000 });
    initCalls = [];
    vi.stubGlobal('fetch', mockGoogle(initCalls, googleFiles));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('init decrypts stored tokens and opens a resumable session for the browser origin', async () => {
    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/init', {
      name: 'report.pdf', mimeType: 'application/pdf', size: 100,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.uploadUrl).toBe('https://upload.example/session-1');
    expect(initCalls).toHaveLength(1);
    expect(initCalls[0].authorization).toBe(`Bearer access-${body.driveAccountId}`);
    expect(initCalls[0].origin).toBe(FRONTEND_URL);
    expect(initCalls[0].body.parents).toEqual(['root']);
  });

  it('init honours the selected drive and target Google folder', async () => {
    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/init', {
      name: 'report.pdf', mimeType: 'application/pdf', size: 100,
      driveAccountId: 'drive-b', parentFolderId: 'gfolder-1',
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).driveAccountId).toBe('drive-b');
    expect(initCalls[0].authorization).toBe('Bearer access-drive-b');
    expect(initCalls[0].body.parents).toEqual(['gfolder-1']);
  });

  it("init rejects another user's drive", async () => {
    await seedUser(t, 'u2');
    await seedDrive(t, 'drive-other', 'u2');
    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/init', {
      name: 'report.pdf', mimeType: 'application/pdf', size: 100, driveAccountId: 'drive-other',
    });
    expect(res.status).toBe(404);
    expect(initCalls).toHaveLength(0);
  });

  it('init requires a drive when a Google folder is targeted', async () => {
    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/init', {
      name: 'report.pdf', mimeType: 'application/pdf', size: 100, parentFolderId: 'gfolder-1',
    });
    expect(res.status).toBe(400);
  });

  it('finalize records the Google parent so the file shows up in folder listings', async () => {
    const rootRes = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', {
      googleFileId: 'gfile-root', driveAccountId: 'drive-a',
    });
    expect(rootRes.status).toBe(201);
    const folderRes = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', {
      googleFileId: 'gfile-folder', driveAccountId: 'drive-a',
    });
    expect(folderRes.status).toBe(201);
    await t.settle();

    const rows = await t.db.prepare('SELECT google_file_id, google_parent_id FROM files ORDER BY google_file_id').all();
    expect(rows.results).toEqual([
      { google_file_id: 'gfile-folder', google_parent_id: 'gfolder-1' },
      { google_file_id: 'gfile-root', google_parent_id: 'root' },
    ]);
  });

  it('finalize is idempotent when sync (or a retry) already inserted the file', async () => {
    const first = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', { googleFileId: 'gfile-root', driveAccountId: 'drive-a' });
    const second = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', { googleFileId: 'gfile-root', driveAccountId: 'drive-a' });
    await t.settle();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const { results } = await t.db.prepare('SELECT COUNT(*) AS n FROM files').all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });

  it('finalize refuses to place a file in a workspace the user cannot edit', async () => {
    await seedUser(t, 'owner');
    await t.db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').bind('ws-1', 'Team', 'owner').run();
    await t.db.prepare('INSERT INTO workspace_folders (id, workspace_id, name) VALUES (?, ?, ?)').bind('wf-1', 'ws-1', 'Docs').run();

    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', {
      googleFileId: 'gfile-root', driveAccountId: 'drive-a', workspaceFolderId: 'wf-1',
    });
    expect(res.status).toBe(403);
  });

  it('finalize assigns workspace files for editors and derives the workspace from the folder', async () => {
    await t.db.prepare('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)').bind('ws-1', 'Team', 'u1').run();
    await t.db.prepare('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)').bind('m1', 'ws-1', 'u1', 'owner').run();
    await t.db.prepare('INSERT INTO workspace_folders (id, workspace_id, name) VALUES (?, ?, ?)').bind('wf-1', 'ws-1', 'Docs').run();

    const res = await apiRequest(t, sid, 'POST', '/api/files/upload/finalize', {
      googleFileId: 'gfile-root', driveAccountId: 'drive-a', workspaceFolderId: 'wf-1',
    });
    await t.settle();
    expect(res.status).toBe(201);
    const row = await t.db.prepare('SELECT workspace_id, workspace_folder_id FROM files').first();
    expect(row).toEqual({ workspace_id: 'ws-1', workspace_folder_id: 'wf-1' });
  });
});
