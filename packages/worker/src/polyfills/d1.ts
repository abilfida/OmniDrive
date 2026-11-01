import Database from 'better-sqlite3';

// Mirrors the parts of Cloudflare D1's result shape that the app relies on.
export interface D1ResultMeta {
  changes: number;
  last_row_id: number;
  duration: number;
}

export interface D1Result<T = any> {
  success: true;
  results: T[];
  meta: D1ResultMeta;
}

// WAL lets reads continue while a write is in progress (the cron sync writes
// while users browse), and busy_timeout makes a writer wait for a lock instead
// of failing at once with SQLITE_BUSY.
export function configureConnection(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
}

// D1 stores booleans as 1/0; better-sqlite3 rejects them.
function toSqliteValue(value: any) {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

export class D1PreparedStatementWrapper {
  private db: Database.Database;
  private query: string;
  private params: any[];

  constructor(db: Database.Database, query: string, params: any[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...values: any[]) {
    return new D1PreparedStatementWrapper(this.db, this.query, values.map(toSqliteValue));
  }

  // Synchronous execution so statements can run inside a better-sqlite3 transaction.
  executeSync<T = any>(): D1Result<T> {
    const start = Date.now();
    const stmt = this.db.prepare(this.query);
    if (stmt.reader) {
      const results = stmt.all(...this.params) as T[];
      return { success: true, results, meta: { changes: 0, last_row_id: 0, duration: Date.now() - start } };
    }
    const info = stmt.run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid), duration: Date.now() - start },
    };
  }

  async first<T = any>(): Promise<T | null> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const stmt = this.db.prepare(this.query);
          const result = stmt.get(...this.params) as T | undefined;
          resolve(result || null);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async all<T = any>(): Promise<D1Result<T>> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.executeSync<T>());
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async run<T = any>(): Promise<D1Result<T>> {
    return this.all<T>();
  }
}

export class D1DatabaseWrapper {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    configureConnection(this.db);
  }

  prepare(query: string) {
    return new D1PreparedStatementWrapper(this.db, query);
  }

  pragma(name: string) {
    return this.db.pragma(name, { simple: true });
  }

  close() {
    this.db.close();
  }

  // Like D1, a batch is atomic: any failing statement rolls back the whole batch.
  async batch<T = any>(statements: D1PreparedStatementWrapper[]): Promise<D1Result<T>[]> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const runAll = this.db.transaction(() => statements.map((s) => s.executeSync<T>()));
          resolve(runAll());
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  exec(query: string) {
    this.db.exec(query);
  }
}
