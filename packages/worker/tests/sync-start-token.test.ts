import { describe, it, expect, beforeEach } from 'vitest';
import { syncDriveAccount } from '../src/services/sync';
import { mapDriveRow } from '../src/types';
import { createTestEnv, seedUser, seedDrive, type TestEnv } from './helpers/app-harness';

// Fake Google service: lists one page per call and records the order of calls.
function fakeDriveService(calls: string[], opts: { pages: number; interruptAfterPage?: number }) {
  let startTokenCalls = 0;
  return {
    getRootFolderId: async () => 'root-id',
    getStartPageToken: async () => {
      calls.push('getStartPageToken');
      return `start-token-${++startTokenCalls}`;
    },
    async *iterateAllFilesAndFolders(_driveId: string, pageToken?: string) {
      let page = pageToken ? Number(pageToken) : 1;
      for (; page <= opts.pages; page++) {
        calls.push(`list:${page}`);
        yield {
          folders: [],
          files: [{ id: `g${page}`, name: `f${page}`, mimeType: 'text/plain', parents: ['root-id'], createdTime: 't', modifiedTime: 't' }],
          nextPageToken: page < opts.pages ? String(page + 1) : undefined,
        };
        if (opts.interruptAfterPage === page) throw new Error('worker killed');
      }
    },
    getQuota: async () => ({}),
  } as any;
}

describe('initial sync change token', () => {
  let t: TestEnv;
  let drive: ReturnType<typeof mapDriveRow>;

  beforeEach(async () => {
    t = createTestEnv();
    await seedUser(t, 'u1');
    await seedDrive(t, 'drive-a', 'u1');
    drive = mapDriveRow((await t.db.prepare('SELECT * FROM drive_accounts').first())!);
  });

  const changeToken = async () =>
    (await t.db.prepare('SELECT change_token FROM sync_state WHERE drive_account_id = ?').bind('drive-a').first<{ change_token: string | null }>())?.change_token;

  it('takes the start token before listing, so changes made during the listing are not lost', async () => {
    const calls: string[] = [];
    await syncDriveAccount(drive, t.env.DB, t.env.KV, fakeDriveService(calls, { pages: 2 }));

    expect(calls).toEqual(['getStartPageToken', 'list:1', 'list:2']);
    expect(await changeToken()).toBe('start-token-1');
  });

  it('keeps the original start token when an interrupted listing resumes in a later run', async () => {
    const firstRun: string[] = [];
    await syncDriveAccount(drive, t.env.DB, t.env.KV, fakeDriveService(firstRun, { pages: 3, interruptAfterPage: 1 }));
    expect(await changeToken()).toBeNull();

    const secondRun: string[] = [];
    await syncDriveAccount(drive, t.env.DB, t.env.KV, fakeDriveService(secondRun, { pages: 3 }));

    expect(secondRun).toEqual(['list:2', 'list:3']); // resumed from the checkpoint, no new start token
    expect(await changeToken()).toBe('start-token-1');
    expect(await t.env.KV.get('sync:start_token:drive-a')).toBeNull();
  });
});
