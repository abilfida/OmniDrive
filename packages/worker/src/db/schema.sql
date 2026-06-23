-- Users (from local auth and Google OAuth)
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    google_id       TEXT UNIQUE,
    email           TEXT UNIQUE,
    name            TEXT,
    avatar_url      TEXT,
    is_super_admin  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected Google Drive accounts
CREATE TABLE IF NOT EXISTS drive_accounts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_account_id TEXT NOT NULL,
    email           TEXT NOT NULL,
    name            TEXT,
    type            TEXT NOT NULL DEFAULT 'oauth',
    is_primary      INTEGER NOT NULL DEFAULT 0,
    root_folder_id  TEXT,
    total_quota     INTEGER DEFAULT 0,
    used_quota      INTEGER DEFAULT 0,
    quota_updated_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, google_account_id)
);

-- Google Drive folder structure (mirrored, read-only)
CREATE TABLE IF NOT EXISTS drive_folders (
    id                TEXT PRIMARY KEY,
    drive_account_id  TEXT NOT NULL REFERENCES drive_accounts(id) ON DELETE CASCADE,
    google_folder_id  TEXT NOT NULL,
    google_parent_id  TEXT,
    name              TEXT NOT NULL,
    is_synced         INTEGER NOT NULL DEFAULT 0,
    synced_at         TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(drive_account_id, google_folder_id)
);

-- Workspaces (Collaborative spaces)
CREATE TABLE IF NOT EXISTS workspaces (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_bytes      INTEGER DEFAULT 0,
    sync_ttl_minutes INTEGER NOT NULL DEFAULT 5,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Workspace members
CREATE TABLE IF NOT EXISTS workspace_members (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor', 'manager', 'auditor', 'owner')),
    joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, user_id)
);

-- Workspace folders (Omnidrive-only folder structure)
CREATE TABLE IF NOT EXISTS workspace_folders (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
    icon            TEXT,
    color           TEXT,
    is_starred      INTEGER NOT NULL DEFAULT 0,
    metadata        TEXT DEFAULT '{}',
    last_synced_at  TEXT,
    sync_status     TEXT NOT NULL DEFAULT 'idle',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, parent_id, name)
);

-- File metadata synced from Google Drive
CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    drive_account_id TEXT NOT NULL REFERENCES drive_accounts(id) ON DELETE CASCADE,
    google_file_id  TEXT NOT NULL,
    workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    workspace_folder_id TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL,
    google_parent_id TEXT,
    name            TEXT NOT NULL,
    mime_type       TEXT,
    size            INTEGER DEFAULT 0,
    thumbnail_url   TEXT,
    web_view_link   TEXT,
    web_content_link TEXT,
    is_trashed      INTEGER NOT NULL DEFAULT 0,
    is_starred      INTEGER NOT NULL DEFAULT 0,
    metadata        TEXT DEFAULT '{}',
    google_created_at  TEXT,
    google_modified_at TEXT,
    last_synced_at  TEXT,
    sync_status     TEXT NOT NULL DEFAULT 'idle',
    synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(drive_account_id, google_file_id)
);

-- Sync state tracking per drive account
CREATE TABLE IF NOT EXISTS sync_state (
    drive_account_id TEXT PRIMARY KEY REFERENCES drive_accounts(id) ON DELETE CASCADE,
    change_token     TEXT,
    next_page_token  TEXT,
    last_synced_at   TEXT,
    status           TEXT DEFAULT 'idle',
    error_message    TEXT
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_files_user_workspace ON files(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_workspace_folder ON files(workspace_folder_id);
CREATE INDEX IF NOT EXISTS idx_files_drive ON files(drive_account_id);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(user_id, name);
CREATE INDEX IF NOT EXISTS idx_files_google_parent ON files(drive_account_id, google_parent_id);
CREATE INDEX IF NOT EXISTS idx_workspace_folders_parent ON workspace_folders(workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_drives_user ON drive_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_parent ON drive_folders(drive_account_id, google_parent_id);

CREATE TABLE IF NOT EXISTS shared_links (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type     TEXT NOT NULL CHECK (target_type IN ('file', 'folder')),
    target_id       TEXT NOT NULL,
    password_hash   TEXT,
    expires_at      TEXT,
    allow_downloads INTEGER NOT NULL DEFAULT 1,
    allow_uploads   INTEGER NOT NULL DEFAULT 0,
    max_downloads   INTEGER,
    require_email   INTEGER NOT NULL DEFAULT 0,
    webhook_url     TEXT,
    view_count      INTEGER NOT NULL DEFAULT 0,
    download_count  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shared_link_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    shared_link_id  TEXT NOT NULL REFERENCES shared_links(id) ON DELETE CASCADE,
    action          TEXT NOT NULL,
    visitor_email   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_links_target ON shared_links(target_type, target_id);

-- Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    trigger_type    TEXT NOT NULL,
    trigger_config  TEXT,
    conditions      TEXT,
    actions         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger_type, is_active);

-- Automation Logs
CREATE TABLE IF NOT EXISTS automation_logs (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    details         TEXT,
    executed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON automation_logs(rule_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type     TEXT NOT NULL,
    resource_id     TEXT,
    resource_name   TEXT,
    metadata        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Workspace Policies
CREATE TABLE IF NOT EXISTS workspace_policies (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_type     TEXT NOT NULL CHECK (target_type IN ('workspace', 'folder')),
    target_id       TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
    policy_type     TEXT NOT NULL CHECK (policy_type IN ('storage_quota', 'data_retention')),
    config          TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_policies_workspace ON workspace_policies(workspace_id);

-- Invitation Codes
CREATE TABLE IF NOT EXISTS invitation_codes (
    id              TEXT PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,
    created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_uses        INTEGER NOT NULL DEFAULT 1,
    used_count      INTEGER NOT NULL DEFAULT 0,
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitation_codes ON invitation_codes(code);

-- Track user generated S3 Credentials
CREATE TABLE IF NOT EXISTS s3_credentials (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_key_id     TEXT UNIQUE NOT NULL,
    secret_key_enc    TEXT NOT NULL,
    description       TEXT,
    workspace_id      TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_s3_credentials_access_key ON s3_credentials(access_key_id);

-- Track active S3 multipart uploads
CREATE TABLE IF NOT EXISTS s3_multipart_uploads (
    upload_id          TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key                TEXT NOT NULL,
    drive_account_id   TEXT NOT NULL REFERENCES drive_accounts(id) ON DELETE CASCADE,
    temp_folder_id     TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Track uploaded parts for active multipart uploads
CREATE TABLE IF NOT EXISTS s3_multipart_parts (
    upload_id          TEXT NOT NULL REFERENCES s3_multipart_uploads(upload_id) ON DELETE CASCADE,
    part_number        INTEGER NOT NULL,
    google_file_id     TEXT NOT NULL,
    etag               TEXT NOT NULL,
    size               INTEGER NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (upload_id, part_number)
);
