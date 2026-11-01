import { describe, it, expect, beforeEach } from 'vitest';
import { syncDriveAccount } from '../src/services/sync';
import { mapDriveRow } from '../src/types';
import { createTestEnv, seedUser, seedDrive, type TestEnv } from './helpers/app-harness';

type Change = { fileId: string; removed: boolean; file?: any };

// Fake Google service for incremental sync: one changes page per call.
function changesService(pages: { changes: Change[]; nextPageToken?: string; newStartPageToken?: string }[], opts: { failOnPage?: number } = {}) {
  const calls: string[] = [];
  return {
    calls,
    getRootFolderId: async () => 'root-id',
    getQuota: async () => ({}),
    listChanges: async (_driveId: string, token: string) => {
      calls.push(token);
      const index = Number(token.replace('t', ''));
      if (opts.failOnPage === index) throw new Error('Google 503');
      return pages[index];
    },
  } as any;
}

const file = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `${id}.txt`, mimeType: 'text/plain', size: '1', parents: ['root-id'], trashed: false,
  createdTime: 't', modifiedTime: 't', ...extra,
});

describe('sync reliability', () => {
  let t: TestEnv;
  let drive: ReturnType<typeof mapDriveRow>;

  beforeEach(async () => {
    t = createTestEnv();
    await seedUser(t, 'u1');
    await seedDrive(t, 'drive-a', 'u1');
    drive = mapDriveRow((await t.db.prepare('SELECT * FROM drive_accounts').first())!);
    await t.db.prepare("INSERT INTO sync_state (drive_account_id, status, change_token) VALUES ('drive-a', 'idle', 't0')").run();
  });

  const state = () => t.db.prepare("SELECT status, change_token FROM sync_state WHERE drive_account_id = 'drive-a'").first<any>();

  it('saves the change token after every page, so a failure mid-way keeps earlier progress', async () => {
    const service = changesService([
      { changes: [{ fileId: 'a', removed: false, file: file('a') }], nextPageToken: 't1' },
      { changes: [{ fileId: 'b', removed: false, file: file('b') }], newStartPageToken: 't9' },
    ], { failOnPage: 1 });

    await syncDriveAccount(drive, t.env.DB, t.env.KV, service);

    expect(await state()).toEqual({ status: 'error', change_token: 't1' });
    const rows = await t.db.prepare('SELECT google_file_id FROM files').all();
    expect(rows.results).toEqual([{ google_file_id: 'a' }]);
  });

  it('removes a deleted folder, even though Google sends no file details for removals', async () => {
    await t.db.prepare("INSERT INTO drive_folders (id, drive_account_id, google_folder_id, name) VALUES ('df1', 'drive-a', 'gfolder', 'Old')").run();
    const service = changesService([{ changes: [{ fileId: 'gfolder', removed: true }], newStartPageToken: 't5' }]);

    await syncDriveAccount(drive, t.env.DB, t.env.KV, service);

    expect(await t.db.prepare("SELECT id FROM drive_folders WHERE id = 'df1'").first()).toBeNull();
    expect(await state()).toEqual({ status: 'idle', change_token: 't5' });
  });

  it('skips a drive another run is already syncing', async () => {
    await t.db.prepare("UPDATE sync_state SET status = 'syncing' WHERE drive_account_id = 'drive-a'").run();
    await t.env.KV.put('sync:lease:drive-a', String(Date.now()));
    const service = changesService([{ changes: [], newStartPageToken: 't5' }]);

    await syncDriveAccount(drive, t.env.DB, t.env.KV, service);

    expect(service.calls).toEqual([]);
    expect(await state()).toEqual({ status: 'syncing', change_token: 't0' });
  });

  it('takes over a sync left in "syncing" by a run that died (no live lease)', async () => {
    await t.db.prepare("UPDATE sync_state SET status = 'syncing' WHERE drive_account_id = 'drive-a'").run();
    const service = changesService([{ changes: [], newStartPageToken: 't5' }]);

    await syncDriveAccount(drive, t.env.DB, t.env.KV, service);

    expect(service.calls).toEqual(['t0']);
    expect(await state()).toEqual({ status: 'idle', change_token: 't5' });
    expect(await t.env.KV.get('sync:lease:drive-a')).toBeNull();
  });

  it('only lets one of two concurrent syncs run', async () => {
    const service = changesService([{ changes: [], newStartPageToken: 't5' }]);
    await Promise.all([
      syncDriveAccount(drive, t.env.DB, t.env.KV, service),
      syncDriveAccount(drive, t.env.DB, t.env.KV, service),
    ]);
    expect(service.calls).toEqual(['t0']);
  });
});
