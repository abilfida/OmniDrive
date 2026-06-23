-- Add workspace_id column to s3_credentials for workspace-scoped S3 API keys
-- NULL = global key (access all workspaces), non-NULL = scoped to specific workspace
ALTER TABLE s3_credentials ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
