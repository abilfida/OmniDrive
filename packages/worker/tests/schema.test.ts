import { describe, it, expect } from 'vitest';

describe('Database Schema', () => {
  it('should have new workspace tables defined in schema', async () => {
    const fs = await import('fs/promises');
    const schema = await fs.readFile('./src/db/schema.sql', 'utf-8');
    
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS workspaces');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS workspace_members');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS workspace_folders');
    expect(schema).not.toContain('CREATE TABLE IF NOT EXISTS virtual_folders');
    expect(schema).toContain('workspace_id');
    expect(schema).toContain('is_super_admin');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS invitation_codes');
  });

  it('should have S3 compatibility tables defined in schema', async () => {
    const fs = await import('fs/promises');
    const schema = await fs.readFile('./src/db/schema.sql', 'utf-8');
    
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS s3_credentials');
    expect(schema).toContain('workspace_id      TEXT REFERENCES workspaces(id) ON DELETE CASCADE');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS s3_multipart_uploads');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS s3_multipart_parts');
  });
});
