import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleDriveService } from '../src/services/google-drive';
import { createTestEnv, seedUser, seedDrive, ENCRYPTION_KEY, type TestEnv } from './helpers/app-harness';

describe('Google API retries', () => {
  let t: TestEnv;
  let service: GoogleDriveService;

  beforeEach(async () => {
    t = createTestEnv();
    await seedUser(t, 'u1');
    await seedDrive(t, 'drive-a', 'u1');
    service = new GoogleDriveService(t.env.KV, 'id', 'secret', ENCRYPTION_KEY);
    GoogleDriveService.retryBaseDelayMs = 1;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retries rate limits and server errors, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('backend error', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ startPageToken: 'tok' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await service.getStartPageToken('drive-a')).toBe('tok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after a bounded number of attempts', async () => {
    const fetchMock = vi.fn(async () => new Response('down', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.getStartPageToken('drive-a')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry client errors', async () => {
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.getStartPageToken('drive-a')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks Google for 1000 items per page when listing changes', async () => {
    const fetchMock = vi.fn(async () => Response.json({ changes: [], newStartPageToken: 'n' }));
    vi.stubGlobal('fetch', fetchMock);
    await service.listChanges('drive-a', 'p1');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('pageSize=1000');
  });
});
