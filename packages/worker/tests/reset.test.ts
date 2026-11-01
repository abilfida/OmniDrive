import { describe, it, expect, vi } from 'vitest';
import { promptUser, resetD1, resetKV } from '../scripts/reset.mjs';

describe('reset.mjs prompt logic', () => {
  it('should return true if not remote', async () => {
    const result = await promptUser(false);
    expect(result).toBe(true);
  });
});

describe('reset.mjs D1 logic', () => {
  it('should execute wrangler d1 commands with correct flag', () => {
    const execSyncMock = vi.fn();
    resetD1(execSyncMock, '--local');
    
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    expect(execSyncMock.mock.calls[0][0]).toContain('DROP TABLE IF EXISTS shared_link_logs');
    expect(execSyncMock.mock.calls[0][0]).toContain('DROP TABLE IF EXISTS users');
    // S3 tables keep their old schema across a factory reset unless dropped too
    for (const table of ['s3_multipart_parts', 's3_multipart_uploads', 's3_credentials']) {
      expect(execSyncMock.mock.calls[0][0]).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(execSyncMock.mock.calls[1][0]).toContain('d1 execute omnidrive --local -y --file=src/db/schema.sql');
  });
});

describe('reset.mjs KV logic', () => {
  it('should fetch keys and execute bulk delete', () => {
    const execSyncMock = vi.fn().mockImplementation((cmd) => {
      if (cmd.includes('kv key list')) {
        return Buffer.from(JSON.stringify([{ name: 'key1' }, { name: 'key2' }]));
      }
      return Buffer.from('');
    });
    
    const writeFileSyncMock = vi.fn();
    const unlinkSyncMock = vi.fn();
    
    resetKV(execSyncMock, writeFileSyncMock, unlinkSyncMock, '--remote');
    
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    expect(writeFileSyncMock).toHaveBeenCalledWith('temp_keys.json', JSON.stringify(['key1', 'key2']));
    expect(execSyncMock.mock.calls[1][0]).toContain('kv bulk delete --binding=KV --remote temp_keys.json');
    expect(unlinkSyncMock).toHaveBeenCalledWith('temp_keys.json');
  });

  it('should do nothing if KV is empty', () => {
    const execSyncMock = vi.fn().mockImplementation((cmd) => {
      if (cmd.includes('kv key list')) {
        return Buffer.from(JSON.stringify([]));
      }
      return Buffer.from('');
    });
    
    const writeFileSyncMock = vi.fn();
    const unlinkSyncMock = vi.fn();
    
    resetKV(execSyncMock, writeFileSyncMock, unlinkSyncMock, '--local');
    
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});
