import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUploadStore } from './uploadStore';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { initiateUpload: vi.fn(), confirmUpload: vi.fn() },
}));

// Minimal XHR stand-in: completes the PUT to Google with the given response.
function stubXhr(status: number, responseText: string) {
  class FakeXhr {
    status = status;
    responseText = responseText;
    upload = { addEventListener: () => {} };
    private listeners: Record<string, () => void> = {};
    addEventListener(type: string, cb: () => void) { this.listeners[type] = cb; }
    open() {}
    setRequestHeader() {}
    send() { setTimeout(() => this.listeners.load?.(), 0); }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

const file = (name: string) => new File(['x'], name, { type: 'text/plain' });

describe('uploadStore.startUpload', () => {
  beforeEach(() => {
    useUploadStore.setState({ queue: [], isUploading: false });
    vi.mocked(api.initiateUpload).mockReset();
    vi.mocked(api.confirmUpload).mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the upload target to init and the workspace fields to finalize', async () => {
    stubXhr(200, JSON.stringify({ id: 'gfile-1' }));
    vi.mocked(api.initiateUpload).mockResolvedValue({ uploadUrl: 'https://u', driveAccountId: 'drive-b', googleFolderId: 'gf' });
    vi.mocked(api.confirmUpload).mockResolvedValue({ file: {} as any });
    useUploadStore.getState().addFiles([file('a.txt')]);

    const result = await useUploadStore.getState().startUpload({ driveAccountId: 'drive-b', parentFolderId: 'gf', workspaceFolderId: 'wf' });

    expect(result).toEqual({ failed: 0 });
    expect(api.initiateUpload).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.txt', driveAccountId: 'drive-b', parentFolderId: 'gf', workspaceFolderId: 'wf' }));
    expect(api.confirmUpload).toHaveBeenCalledWith({ googleFileId: 'gfile-1', driveAccountId: 'drive-b', workspaceId: undefined, workspaceFolderId: 'wf' });
    expect(useUploadStore.getState().queue[0].status).toBe('done');
  });

  it('reports failed items instead of pretending the upload completed', async () => {
    vi.mocked(api.initiateUpload).mockRejectedValue(new Error('Drive token missing'));
    useUploadStore.getState().addFiles([file('a.txt'), file('b.txt')]);

    const result = await useUploadStore.getState().startUpload();

    expect(result).toEqual({ failed: 2 });
    expect(useUploadStore.getState().queue.map((q) => q.status)).toEqual(['error', 'error']);
    expect(useUploadStore.getState().isUploading).toBe(false);
  });

  it('fails the item (instead of hanging) when Google returns a non-JSON body', async () => {
    stubXhr(200, '<html>oops</html>');
    vi.mocked(api.initiateUpload).mockResolvedValue({ uploadUrl: 'https://u', driveAccountId: 'd', googleFolderId: 'root' });
    useUploadStore.getState().addFiles([file('a.txt')]);

    const result = await useUploadStore.getState().startUpload();

    expect(result).toEqual({ failed: 1 });
    expect(api.confirmUpload).not.toHaveBeenCalled();
  });
});
