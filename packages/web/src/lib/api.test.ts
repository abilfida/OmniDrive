import { describe, it, expect, afterEach, vi } from 'vitest';
import { api } from './api';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has trash related functions', () => {
    expect(typeof api.getTrashFiles).toBe('function');
    expect(typeof api.restoreFile).toBe('function');
    expect(typeof api.deleteFilePermanent).toBe('function');
  });

  it('renames files through PATCH /api/files/:id/rename', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.renameFile('f1', 'new.txt');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/files\/f1\/rename$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'new.txt' });
  });
});
