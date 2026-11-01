import { create } from 'zustand';
import { api } from '../lib/api';
import type { UploadTarget } from '../types';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error';
  error?: string;
}

interface UploadState {
  queue: UploadItem[];
  isUploading: boolean;
  showModal: boolean;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearQueue: () => void;
  startUpload: (target?: UploadTarget) => Promise<{ failed: number }>;
  setShowModal: (show: boolean) => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  queue: [],
  isUploading: false,
  showModal: false,

  addFiles: (files: File[]) => {
    const items: UploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending',
    }));
    set((state) => ({ queue: [...state.queue, ...items], showModal: true }));
  },

  removeFile: (id: string) => {
    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }));
  },

  clearQueue: () => set({ queue: [], isUploading: false }),

  startUpload: async (target: UploadTarget = {}) => {
    set({ isUploading: true });
    const { queue } = get();
    let failed = 0;

    for (const item of queue) {
      if (item.status !== 'pending') continue;

      try {
        // Update status
        set((state) => ({
          queue: state.queue.map((q) => (q.id === item.id ? { ...q, status: 'uploading' as const } : q)),
        }));

        // 1. Initiate upload — get resumable URL from Worker
        const { uploadUrl, driveAccountId: actualDriveId } = await api.initiateUpload({
          name: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          size: item.file.size,
          ...target,
        });

        // 2. Upload directly to Google Drive
        const uploadResponse = await uploadToGoogleDrive(uploadUrl, item.file, (progress) => {
          set((state) => ({
            queue: state.queue.map((q) => (q.id === item.id ? { ...q, progress } : q)),
          }));
        });

        // 3. Confirm upload with Worker
        set((state) => ({
          queue: state.queue.map((q) => (q.id === item.id ? { ...q, status: 'confirming' as const, progress: 100 } : q)),
        }));

        await api.confirmUpload({
          googleFileId: uploadResponse.id,
          driveAccountId: actualDriveId,
          workspaceId: target.workspaceId,
          workspaceFolderId: target.workspaceFolderId,
        });

        set((state) => ({
          queue: state.queue.map((q) => (q.id === item.id ? { ...q, status: 'done' as const } : q)),
        }));
      } catch (err) {
        failed++;
        set((state) => ({
          queue: state.queue.map((q) =>
            q.id === item.id ? { ...q, status: 'error' as const, error: (err as Error).message } : q
          ),
        }));
      }
    }

    set({ isUploading: false });
    return { failed };
  },

  setShowModal: (show: boolean) => set({ showModal: show }),
}));

async function uploadToGoogleDrive(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed: ${xhr.status}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Upload finished but Google returned an unreadable response'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}
