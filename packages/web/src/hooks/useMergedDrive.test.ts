import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMergedDrive } from './useMergedDrive';
import { useDriveStore } from '../stores/driveStore';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getDriveFolderContents: vi.fn() } }));

type Contents = Awaited<ReturnType<typeof api.getDriveFolderContents>>;
const contents = (name: string) => ({ folder: null, subfolders: [], files: [{ id: name, name }], breadcrumb: [] }) as unknown as Contents;

// Lets a test decide when each folder's response arrives.
function deferredResponses() {
  const pending = new Map<string, (value: Contents) => void>();
  vi.mocked(api.getDriveFolderContents).mockImplementation((_drive: string, folder: string) =>
    new Promise<Contents>((resolve) => pending.set(folder, resolve))
  );
  return (folder: string, name = folder) => act(async () => { pending.get(folder)!(contents(name)); });
}

describe('useMergedDrive', () => {
  beforeEach(() => {
    vi.mocked(api.getDriveFolderContents).mockReset();
    useDriveStore.setState({ drives: [{ id: 'd1', email: 'a@x' }] as any });
  });

  it('ignores a slow response for a folder the user already left', async () => {
    const respond = deferredResponses();
    const { result, rerender } = renderHook(({ folder }) => useMergedDrive(folder, 'd1'), { initialProps: { folder: 'A' } });

    rerender({ folder: 'B' });
    await respond('B');
    await respond('A'); // arrives late

    await waitFor(() => expect(result.current.files.map((f) => f.id)).toEqual(['B']));
  });

  it("does not let a refresh started in one folder overwrite the next folder's listing", async () => {
    const respond = deferredResponses();
    const { result, rerender } = renderHook(({ folder }) => useMergedDrive(folder, 'd1'), { initialProps: { folder: 'A' } });
    await respond('A');

    act(() => { result.current.refresh(); }); // e.g. after a rename in folder A
    rerender({ folder: 'B' });
    await respond('B');
    await respond('A', 'A-refreshed');

    await waitFor(() => expect(result.current.files.map((f) => f.id)).toEqual(['B']));
    expect(result.current.isLoading).toBe(false);
  });
});
