import Database from 'better-sqlite3';
import { configureConnection } from './d1';

export class KVNamespaceWrapper {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    configureConnection(this.db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expiration INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_kv_store_expiration ON kv_store(expiration);
    `);
  }

  // Expired keys are otherwise only removed when they are read again, so
  // sessions and OAuth states that are never revisited would pile up forever.
  purgeExpired(): number {
    return this.db.prepare('DELETE FROM kv_store WHERE expiration IS NOT NULL AND expiration < ?')
      .run(Math.floor(Date.now() / 1000)).changes;
  }

  pragma(name: string) {
    return this.db.pragma(name, { simple: true });
  }

  close() {
    this.db.close();
  }

  async get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const stmt = this.db.prepare('SELECT value, expiration FROM kv_store WHERE id = ?');
          const row = stmt.get(key) as { value: string; expiration: number | null } | undefined;
          
          if (!row) return resolve(null);
          
          if (row.expiration && row.expiration < Math.floor(Date.now() / 1000)) {
            // Delete asynchronously, resolve null
            this.delete(key).then(() => resolve(null)).catch(reject);
            return;
          }
          
          resolve(row.value);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
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
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const stmt = this.db.prepare('DELETE FROM kv_store WHERE id = ?');
          stmt.run(key);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}
