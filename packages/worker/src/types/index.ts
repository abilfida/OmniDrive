import type { AutomationRule, AutomationLog, RuleCondition, RuleAction } from './automation';
import { DEFAULT_FOLDER_ICON, DEFAULT_FOLDER_COLOR } from '../constants';

// ─── Domain Types ───

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
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
  quotaUpdatedAt: string | null;
  createdAt: string;
}

export interface VirtualFolder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  icon: string;
  color: string;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileEntry {
  id: string;
  userId: string;
  driveAccountId: string;
  googleFileId: string;
  virtualFolderId: string | null;
  googleParentId: string | null;
  name: string;
  mimeType: string | null;
  size: number;
  thumbnailUrl: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  isTrashed: boolean;
  isStarred: boolean;
  googleCreatedAt: string | null;
  googleModifiedAt: string | null;
  syncedAt: string;
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  createdAt: string;
}

export interface SyncState {
  driveAccountId: string;
  changeToken: string | null;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'error';
  errorMessage: string | null;
}

export interface DriveFolder {
  id: string;
  driveAccountId: string;
  googleFolderId: string;
  googleParentId: string | null;
  name: string;
  isSynced: boolean;
  syncedAt: string | null;
  createdAt: string;
}

export interface SharedLink {
  id: string;
  userId: string;
  targetType: 'file' | 'folder';
  targetId: string;
  targetName?: string;
  passwordHash?: string | null;
  expiresAt?: string | null;
  allowDownloads: boolean;
  allowUploads: boolean;
  maxDownloads?: number | null;
  requireEmail: boolean;
  webhookUrl?: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
}

// ─── KV Types ───

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp ms
}

export interface QuotaCache {
  total: number;
  used: number;
  updatedAt: string;
}

// ─── API Response Types ───

export interface DriveWithQuota extends DriveAccount {
  freeSpace: number;
  usagePercent: number;
}

export interface AggregateQuota {
  totalQuota: number;
  totalUsed: number;
  totalFree: number;
  driveCount: number;
}

export interface FolderContents {
  folder: VirtualFolder | null;
  subfolders: VirtualFolder[];
  files: (FileEntry & { driveEmail: string })[];
  breadcrumb: BreadcrumbItem[];
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface UploadInitResponse {
  uploadUrl: string;
  driveAccountId: string;
  googleFolderId: string;
}

// ─── Row Mappers ───

export function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    googleId: row.google_id as string,
    email: row.email as string,
    name: row.name as string,
    avatarUrl: (row.avatar_url as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapDriveRow(row: Record<string, unknown>): DriveAccount {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    googleAccountId: row.google_account_id as string,
    email: row.email as string,
    name: (row.name as string) ?? null,
    type: row.type as 'oauth' | 'service_account',
    isPrimary: row.is_primary === 1,
    rootFolderId: (row.root_folder_id as string) ?? null,
    totalQuota: (row.total_quota as number) ?? 0,
    usedQuota: (row.used_quota as number) ?? 0,
    quotaUpdatedAt: (row.quota_updated_at as string) ?? null,
    syncStatus: (row.sync_status as 'idle' | 'syncing' | 'error') ?? 'idle',
    lastSyncedAt: (row.last_synced_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function mapFolderRow(row: Record<string, unknown>): VirtualFolder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    parentId: (row.parent_id as string) ?? null,
    icon: (row.icon as string) ?? DEFAULT_FOLDER_ICON,
    color: (row.color as string) ?? DEFAULT_FOLDER_COLOR,
    isStarred: row.is_starred === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapFileRow(row: Record<string, unknown>): FileEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    driveAccountId: row.drive_account_id as string,
    googleFileId: row.google_file_id as string,
    virtualFolderId: (row.workspace_folder_id as string) ?? (row.virtual_folder_id as string) ?? null,
    googleParentId: (row.google_parent_id as string) ?? null,
    name: row.name as string,
    mimeType: (row.mime_type as string) ?? null,
    size: (row.size as number) ?? 0,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    webViewLink: (row.web_view_link as string) ?? null,
    webContentLink: (row.web_content_link as string) ?? null,
    isTrashed: row.is_trashed === 1,
    isStarred: row.is_starred === 1,
    googleCreatedAt: (row.google_created_at as string) ?? null,
    googleModifiedAt: (row.google_modified_at as string) ?? null,
    syncedAt: row.synced_at as string,
    lastSyncedAt: (row.last_synced_at as string) ?? null,
    syncStatus: (row.sync_status as 'idle' | 'syncing' | 'error') ?? 'idle',
    createdAt: row.created_at as string,
  };
}

export function mapDriveFolderRow(row: Record<string, unknown>): DriveFolder {
  return {
    id: row.id as string,
    driveAccountId: row.drive_account_id as string,
    googleFolderId: row.google_folder_id as string,
    googleParentId: (row.google_parent_id as string) ?? null,
    name: row.name as string,
    isSynced: row.is_synced === 1,
    syncedAt: (row.synced_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function mapSharedLinkRow(row: Record<string, unknown>): SharedLink {
  const targetType = row.target_type as string;
  if (targetType !== 'file' && targetType !== 'folder') {
    throw new Error(`Invalid target_type: ${targetType}`);
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    targetType: targetType as 'file' | 'folder',
    targetId: row.target_id as string,
    targetName: (row.targetName as string) ?? undefined,
    passwordHash: (row.password_hash as string | null | undefined) ?? null,
    expiresAt: (row.expires_at as string | null | undefined) ?? null,
    allowDownloads: Boolean(row.allow_downloads ?? 1),
    allowUploads: Boolean(row.allow_uploads ?? 0),
    maxDownloads: (row.max_downloads as number | null | undefined) ?? null,
    requireEmail: Boolean(row.require_email ?? 0),
    webhookUrl: (row.webhook_url as string | null | undefined) ?? null,
    viewCount: (row.view_count as number | undefined) || 0,
    downloadCount: (row.download_count as number | undefined) || 0,
    createdAt: row.created_at as string,
  };
}

export function mapAutomationRuleRow(row: Record<string, unknown>): AutomationRule {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    triggerType: row.trigger_type as 'event' | 'cron',
    triggerConfig: typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : (row.trigger_config as Record<string, unknown> || {}),
    conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : (row.conditions as RuleCondition[] || []),
    actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : (row.actions as RuleAction[] || []),
    isActive: row.is_active === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapAutomationLogRow(row: Record<string, unknown>): AutomationLog {
  return {
    id: row.id as string,
    ruleId: row.rule_id as string,
    status: row.status as string,
    details: (row.details as string) ?? null,
    executedAt: row.executed_at as string,
  };
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

export function mapWorkspaceRow(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    name: row.name as string,
    ownerId: row.owner_id as string,
    usedBytes: (row.used_bytes as number) ?? 0,
    syncTtlMinutes: (row.sync_ttl_minutes as number) ?? 5,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapWorkspaceFolderRow(row: Record<string, unknown>): WorkspaceFolder {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    parentId: (row.parent_id as string) ?? null,
    icon: (row.icon as string) ?? null,
    color: (row.color as string) ?? null,
    metadata: (row.metadata as string) ?? '{}',
    isStarred: row.is_starred === 1,
    lastSyncedAt: (row.last_synced_at as string) ?? null,
    syncStatus: (row.sync_status as 'idle' | 'syncing' | 'error') ?? 'idle',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  used_bytes: number;
  created_at: string;
  updated_at: string;
  sync_ttl_minutes: number;
}

export interface WorkspaceFolderRow {
  id: string;
  workspace_id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  is_starred: number;
  metadata: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
}

export interface FileRow {
  id: string;
  user_id: string;
  drive_account_id: string;
  google_file_id: string;
  workspace_id: string | null;
  workspace_folder_id: string | null;
  google_parent_id: string | null;
  name: string;
  mime_type: string | null;
  size: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  web_content_link: string | null;
  is_trashed: number;
  is_starred: number;
  metadata: string;
  google_created_at: string | null;
  google_modified_at: string | null;
  synced_at: string;
  last_synced_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
}
