import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveService } from '../src/services/google-drive';

describe('GoogleDriveService Move Operations', () => {
  let service: GoogleDriveService;
  let mockKv: any;

  beforeEach(() => {
    mockKv = {
      get: vi.fn().mockResolvedValue(JSON.stringify({
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        expiresAt: Date.now() + 3600_000,
      })),
      put: vi.fn().mockResolvedValue(undefined),
    };
    service = new GoogleDriveService(mockKv, 'client-id', 'client-secret');
    globalThis.fetch = vi.fn();
  });

  describe('shareFile', () => {
    it('sends POST request to share file', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'permission-id' })
      });

      const permId = await service.shareFile('driveAccountId', 'fileId', 'test@example.com');
      
      expect(permId).toBe('permission-id');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/fileId/permissions?sendNotificationEmail=false',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-access-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            role: 'writer',
            type: 'user',
            emailAddress: 'test@example.com'
          })
        })
      );
    });
  });

  describe('revokeShare', () => {
    it('sends DELETE request to revoke share', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true
      });

      await service.revokeShare('driveAccountId', 'fileId', 'permissionId');
      
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/fileId/permissions/permissionId',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-access-token'
          })
        })
      );
    });
  });

  describe('copyFile', () => {
    it('sends POST request to copy file', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'new-file-id', name: 'Copy' })
      });

      const file = await service.copyFile('driveAccountId', 'fileId');
      
      expect(file.id).toBe('new-file-id');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/fileId/copy?fields=id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime,md5Checksum',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer fake-access-token'
          }
        }
      );
    });
  });

  describe('trashFile', () => {
    it('sends PATCH request to trash file', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true
      });

      await service.trashFile('driveAccountId', 'fileId');
      
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/fileId',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-access-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            trashed: true
          })
        })
      );
    });
  });
});
