import { test, expect, vi } from 'vitest';
import { GoogleDriveService } from '../services/google-drive';

test('iterateAllFilesAndFolders yields chunks of data', async () => {
  const kv = { get: vi.fn(), put: vi.fn() } as any;
  const service = new GoogleDriveService(kv, 'client_id', 'secret');
  service.getValidToken = vi.fn().mockResolvedValue('token');

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      files: [{ id: '1', mimeType: 'application/vnd.google-apps.folder' }],
      nextPageToken: undefined
    })
  });

  const iterator = service.iterateAllFilesAndFolders('drive_1', 'token123');
  const result = await iterator.next();
  
  expect(result.done).toBe(false);
  expect(result.value.folders).toHaveLength(1);
  expect(result.value.nextPageToken).toBeUndefined();
  
  const end = await iterator.next();
  expect(end.done).toBe(true);
});
