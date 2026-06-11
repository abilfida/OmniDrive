const API_BASE = import.meta.env.VITE_API_URL ?? '';
import type { WorkspaceFolder } from '../types';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  getSetupStatus: () => request<{ isSetup: boolean }>('/api/auth/setup-status'),
  login: (data: any) => request<{ success: boolean; user: import('../types').User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data: any) => request<{ success: boolean; user: import('../types').User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getUser: () => request<{ user: import('../types').User }>('/api/auth/me'),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  getInvitations: () => request<{ invitations: any[] }>('/api/admin/invitations'),
  createInvitation: (code: string, max_uses: number) => request<{ success: boolean, invitation: any }>('/api/admin/invitations', { method: 'POST', body: JSON.stringify({ code, max_uses }) }),
  deleteInvitation: (id: string) => request<{ success: boolean }>(`/api/admin/invitations/${id}`, { method: 'DELETE' }),
  getAdminUsers: () => request<{ users: import('../types').User[] }>('/api/admin/users'),
  adminCreateUser: (data: any) => request<{ success: boolean; user: import('../types').User }>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),

  // Drives
  getDrives: () =>
    request<{ drives: import('../types').DriveAccount[]; aggregate: import('../types').AggregateQuota }>('/api/drives/'),
  disconnectDrive: (id: string) => request<{ success: boolean }>(`/api/drives/${id}`, { method: 'DELETE' }),
  addServiceAccount: (credentials: string, folderId: string) =>
    request<{ success: boolean; driveId: string }>('/api/drives/service-account', {
      method: 'POST',
      body: JSON.stringify({ credentials, folderId }),
    }),
  triggerSync: (id: string) => request<{ success: boolean }>(`/api/drives/${id}/sync`, { method: 'POST' }),
  getDriveFolderContents: (driveId: string, googleFolderId: string) =>
    request<import('../types').DriveFolderContents>(`/api/drives/${driveId}/folders/${googleFolderId}`),
  syncDriveFolder: (driveId: string, googleFolderId: string) =>
    request<import('../types').DriveFolderContents>(`/api/drives/${driveId}/folders/${googleFolderId}/sync`, { method: 'POST' }),


  // Folders
  getRootContents: () => request<import('../types').FolderContents>('/api/folders/'),
  getFolderContents: (id: string, cursor?: string, limit?: number, driveId?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit.toString());
    if (driveId) params.set('driveId', driveId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<import('../types').FolderContents>(`/api/folders/${id}${query}`);
  },
  createFolder: (name: string, parentId?: string, icon?: string, color?: string) =>
    request<{ folder: WorkspaceFolder }>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId, icon, color }),
    }),
  updateFolder: (id: string, data: { name?: string; parentId?: string | null; icon?: string; color?: string }) =>
    request<{ success: boolean }>(`/api/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFolder: (id: string) => request<{ success: boolean }>(`/api/folders/${id}`, { method: 'DELETE' }),

  getWorkspaceTree: () => request<{ folders: WorkspaceFolder[] }>('/api/folders/tree'),
  addFilesToWorkspace: (id: string, fileIds: string[]) =>
    request<{ success: boolean }>(`/api/folders/${id}/files`, {
      method: 'POST',
      body: JSON.stringify({ fileIds }),
    }),
  syncWorkspace: (id: string) =>
    request<{ success: boolean }>(`/api/folders/${id}/sync`, { method: 'POST' }),

  // Files
  getFile: (id: string) => request<import('../types').FileEntry>(`/api/files/${id}`),
  searchFiles: (query: string) =>
    request<{ files: import('../types').FileEntry[]; query: string }>(`/api/files/search?q=${encodeURIComponent(query)}`),
  initiateUpload: (data: { name: string; mimeType: string; size: number; driveAccountId?: string; workspaceFolderId?: string }) =>
    request<import('../types').UploadInitResponse>('/api/files/upload/init', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  confirmUpload: (data: { googleFileId: string; driveAccountId: string; workspaceFolderId?: string }) =>
    request<{ file: import('../types').FileEntry }>('/api/files/upload/finalize', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  moveFile: (id: string, workspaceFolderId: string | null) =>
    request<{ success: boolean }>(`/api/files/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ workspaceFolderId }),
    }),
  renameFile: (id: string, name: string) =>
    request<{ success: boolean }>(`/api/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteFile: (id: string) => request<{ success: boolean }>(`/api/files/${id}`, { method: 'DELETE' }),
  moveFileToDrive: (id: string, targetDriveId: string) =>
    request<{ file: import('../types').FileEntry }>(`/api/files/${id}/move-drive`, {
      method: 'POST',
      body: JSON.stringify({ targetDriveId }),
    }),

  // Trash
  getTrashFiles: () =>
    request<{ files: import('../types').FileEntry[] }>('/api/files/trash'),
  restoreFile: (id: string) =>
    request<{ success: boolean }>(`/api/files/${id}/restore`, { method: 'POST' }),
  deleteFilePermanent: (id: string) =>
    request<{ success: boolean }>(`/api/files/${id}/permanent`, { method: 'DELETE' }),

  // Starred Files
  getStarred: () => request<{ files: import('../types').FileEntry[], folders: import('../types').WorkspaceFolder[] }>('/api/files/starred'),
  starFile: (id: string) => request<{ success: boolean }>(`/api/files/${id}/star`, { method: 'POST' }),
  unstarFile: (id: string) => request<{ success: boolean }>(`/api/files/${id}/unstar`, { method: 'POST' }),
  starFolder: (id: string) => request<{ success: boolean }>(`/api/folders/${id}/star`, { method: 'POST' }),
  unstarFolder: (id: string) => request<{ success: boolean }>(`/api/folders/${id}/unstar`, { method: 'POST' }),

  // Recent files (uses root contents, sorted by date)
  getRecentFiles: () =>
    request<{ files: import('../types').FileEntry[], folders: import('../types').WorkspaceFolder[] }>('/api/files/recent'),

  // Automations
  getAutomations: () => request<{ rules: any[] }>('/api/automations'),
  toggleAutomation: (id: string, is_active: boolean) =>
    request<{ success: boolean }>(`/api/automations/${id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    }),

  // Audit Logs
  getWorkspaceAuditLogs: (workspaceId: string) =>
    request<{ logs: import('../types').AuditLog[] }>(`/api/workspaces/${workspaceId}/audit-logs`),
  getAdminAuditLogs: () =>
    request<{ logs: import('../types').AuditLog[] }>('/api/admin/audit-logs'),

  // Policies
  getWorkspacePolicies: (workspaceId: string) =>
    request<{ policies: import('../types').WorkspacePolicy[] }>(`/api/workspaces/${workspaceId}/policies`),
  createWorkspacePolicy: (workspaceId: string, data: { targetType: 'workspace' | 'folder', targetId?: string, policyType: 'storage_quota' | 'data_retention', config: any }) =>
    request<{ policy: import('../types').WorkspacePolicy }>(`/api/workspaces/${workspaceId}/policies`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteWorkspacePolicy: (workspaceId: string, policyId: string) =>
    request<{ success: boolean }>(`/api/workspaces/${workspaceId}/policies/${policyId}`, { method: 'DELETE' }),

  // Metadata & Search
  updateFileMetadata: (fileId: string, metadata: Record<string, string>) =>
    request<{ success: boolean }>(`/api/files/${fileId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata }),
    }),
  updateFolderMetadata: (workspaceId: string, folderId: string, metadata: Record<string, string>) =>
    request<{ success: boolean }>(`/api/workspaces/${workspaceId}/folders/${folderId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata }),
    }),
  globalSearch: (query: string, workspaceId?: string, metadata?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (workspaceId) params.set('workspaceId', workspaceId);
    if (metadata && Object.keys(metadata).length > 0) params.set('metadata', JSON.stringify(metadata));
    return request<{ files: import('../types').FileEntry[], query: string }>(`/api/files/search?${params.toString()}`);
  },
};

export { ApiError };

export interface SharedLink {
  id: string;
  userId: string;
  targetType: 'file' | 'folder';
  targetId: string;
  targetName?: string;
  expiresAt: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  allowDownloads: boolean;
  allowUploads: boolean;
  maxDownloads: number | null;
  requireEmail: boolean;
  webhookUrl: string | null;
}

export interface SharedMetaResponse {
  type?: 'file' | 'folder';
  target?: import('../types').FileEntry;
  targetId?: string;
  requiresPassword?: boolean;
}

export interface CreateSharedLinkPayload {
  targetType: 'file' | 'folder';
  targetId: string;
  password?: string | null;
  expiresAt?: string | null;
  allowDownloads?: boolean;
  allowUploads?: boolean;
  maxDownloads?: number | null;
  requireEmail?: boolean;
  webhookUrl?: string;
}

export const createSharedLink = async (payload: CreateSharedLinkPayload) => {
  return request<{ id: string; url: string }>('/api/shared', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export async function updateSharedLink(id: string, payload: Partial<CreateSharedLinkPayload>) {
  return await request(`/api/shared/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export const getSharedLinks = async () => {
  return request<{ links: SharedLink[] }>('/api/shared');
};

export const deleteSharedLink = async (id: string) => {
  return request<{ success: boolean }>(`/api/shared/${id}`, { method: 'DELETE' });
};

export const getSharedMeta = async (id: string) => {
  try {
    return await request<SharedMetaResponse>(`/api/shared/${id}/meta`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { requiresPassword: true };
    }
    throw error;
  }
};

export const verifySharedPassword = async (id: string, password: string) => {
  return request<{ success: boolean }>(`/api/shared/${id}/verify`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }).catch((error) => {
    if (error instanceof ApiError && error.status === 401) {
      throw new Error('Invalid password');
    }
    throw error;
  });
};
