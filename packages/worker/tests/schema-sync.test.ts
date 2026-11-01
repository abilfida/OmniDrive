import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { D1DatabaseWrapper } from '../src/polyfills/d1';
import { applySchema } from '../src/polyfills/schema';

const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf-8');

async function columns(db: D1DatabaseWrapper, table: string) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return results.map((c) => c.name);
}

describe('applySchema (Node runtime)', () => {
  it('creates the full schema on an empty database', async () => {
    const db = new D1DatabaseWrapper(':memory:');
    applySchema(db, schema);
    expect(await columns(db, 'users')).toContain('is_super_admin');
    expect(await columns(db, 's3_credentials')).toContain('workspace_id');
  });

  it('adds columns, tables and indexes that an older database is missing, keeping its data', async () => {
    const db = new D1DatabaseWrapper(':memory:');
    // Shape of a pre-0.9 volume: older users / sync_state tables, no S3 tables.
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        google_id TEXT UNIQUE, email TEXT UNIQUE, name TEXT, avatar_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE drive_accounts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        google_account_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT,
        type TEXT NOT NULL DEFAULT 'oauth', is_primary INTEGER NOT NULL DEFAULT 0, root_folder_id TEXT,
        total_quota INTEGER DEFAULT 0, used_quota INTEGER DEFAULT 0, quota_updated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, google_account_id)
      );
      CREATE TABLE sync_state (
        drive_account_id TEXT PRIMARY KEY REFERENCES drive_accounts(id) ON DELETE CASCADE,
        change_token TEXT, last_synced_at TEXT, status TEXT NOT NULL DEFAULT 'idle', error_message TEXT
      );
      INSERT INTO users (id, username, password_hash) VALUES ('u1', 'alice', 'hash');
    `);

    const added = applySchema(db, schema);

    expect(added).toEqual(expect.arrayContaining(['users.is_super_admin', 'sync_state.next_page_token']));
    expect(await columns(db, 'users')).toContain('is_super_admin');
    expect(await columns(db, 'sync_state')).toContain('next_page_token');
    expect(await columns(db, 's3_credentials')).toContain('workspace_id');
    const alice = await db.prepare('SELECT username, is_super_admin FROM users WHERE id = ?').bind('u1').first();
    expect(alice).toEqual({ username: 'alice', is_super_admin: 0 });
  });

  it('is a no-op on an up-to-date database', async () => {
    const db = new D1DatabaseWrapper(':memory:');
    applySchema(db, schema);
    expect(applySchema(db, schema)).toEqual([]);
  });
});
