export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role?: 'super_admin' | 'member';
  status?: 'active' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

export interface DriveAccount {
  id: string;
  userId: string;
  googleAccountId: string;
  email: string;
  name: string | null;
  type: 'oauth' | 'service_account';
  isPrimary: boolean;
  rootFolderId: string | null;
  totalQuota: number;
  usedQuota: number;
  freeSpace: number;
  usagePercent: number;
  quotaUpdatedAt: string | null;
  createdAt: string;
}

export interface AggregateQuota {
  totalQuota: number;
  totalUsed: number;
  totalFree: number;
  driveCount: number;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  usedBytes?: number;
  syncTtlMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'viewer' | 'commenter' | 'editor' | 'manager' | 'auditor' | 'owner';
  joinedAt: string;
}

export interface WorkspaceFolder {
  id: string;
  workspaceId: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  metadata?: string | Record<string, string>;
  isStarred: boolean;
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface FileEntry {
  id: string;
  userId: string;
  driveAccountId: string;
  googleFileId: string;
  workspaceId: string | null;
  workspaceFolderId: string | null;
  googleParentId: string | null;
  name: string;
  mimeType: string | null;
  size: number;
  thumbnailUrl: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  isTrashed: boolean;
  metadata?: string | Record<string, string>;
  googleCreatedAt: string | null;
  googleModifiedAt: string | null;
  syncedAt: string;
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  createdAt: string;
  driveEmail?: string;  // optional — not present in folder-browse responses
  isStarred?: boolean;
}


export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FolderContents {
  folder: WorkspaceFolder | null;
  subfolders: WorkspaceFolder[];
  files: FileEntry[];
  breadcrumb: BreadcrumbItem[];
  pagination?: PaginationMeta;
}

export interface DriveFolder {
  id?: string;
  driveAccountId?: string;
  googleFolderId: string;
  googleParentId?: string | null;
  name: string;
  isSynced: boolean;
  syncedAt?: string | null;
  isStarred?: boolean;
}

export interface DriveFolderContents {
  folder: DriveFolder | null;
  subfolders: DriveFolder[];
  files: FileEntry[];
  breadcrumb: BreadcrumbItem[];
}

export interface UploadInitResponse {
  uploadUrl: string;
  driveAccountId: string;
  googleFolderId: string;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

export interface AuditLog {
  id: string;
  workspaceId: string | null;
  actorId: string;
  actionType: string;
  resourceId: string | null;
  resourceName: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface WorkspacePolicy {
  id: string;
  workspaceId: string;
  targetType: 'workspace' | 'folder';
  targetId: string | null;
  policyType: 'storage_quota' | 'data_retention';
  config: string;
  createdAt: string;
  updatedAt: string;
}
