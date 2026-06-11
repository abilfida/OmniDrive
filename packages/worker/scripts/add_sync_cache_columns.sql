ALTER TABLE workspaces ADD COLUMN sync_ttl_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE workspace_folders ADD COLUMN last_synced_at TEXT;
ALTER TABLE workspace_folders ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE files ADD COLUMN last_synced_at TEXT;
ALTER TABLE files ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
