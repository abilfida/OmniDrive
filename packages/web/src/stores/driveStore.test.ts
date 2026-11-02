import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDriveStore } from './driveStore';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getDrives: vi.fn() } }));

describe('driveStore.fetchDrives', () => {
  beforeEach(() => useDriveStore.setState({ drives: [], isLoading: false, error: null }));

  it('records the failure so pages can offer a retry', async () => {
    vi.mocked(api.getDrives).mockRejectedValueOnce(new Error('Too many requests'));
    await useDriveStore.getState().fetchDrives();
    expect(useDriveStore.getState()).toMatchObject({ isLoading: false, error: 'Too many requests', drives: [] });
  });

  it('clears the error once loading succeeds', async () => {
    useDriveStore.setState({ error: 'old failure' });
    vi.mocked(api.getDrives).mockResolvedValueOnce({ drives: [{ id: 'd1' }], aggregate: {} } as any);
    await useDriveStore.getState().fetchDrives();
    expect(useDriveStore.getState().error).toBeNull();
    expect(useDriveStore.getState().drives).toHaveLength(1);
  });
});
