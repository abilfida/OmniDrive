import Database from 'better-sqlite3';

export class KVNamespaceWrapper {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expiration INTEGER
      )
    `);
  }

  async get(key: string): Promise<string | null> {
    const stmt = this.db.prepare('SELECT value, expiration FROM kv_store WHERE id = ?');
    const row = stmt.get(key) as { value: string; expiration: number | null } | undefined;
    
    if (!row) return null;
    
    if (row.expiration && row.expiration < Math.floor(Date.now() / 1000)) {
      await this.delete(key);
      return null;
    }
    
    return row.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    let expiration: number | null = null;
    if (options?.expirationTtl) {
      expiration = Math.floor(Date.now() / 1000) + options.expirationTtl;
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO kv_store (id, value, expiration) 
      VALUES (?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET value = excluded.value, expiration = excluded.expiration
    `);
    stmt.run(key, value, expiration);
  }

  async delete(key: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM kv_store WHERE id = ?');
    stmt.run(key);
  }
}
