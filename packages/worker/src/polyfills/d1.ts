import Database from 'better-sqlite3';

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
    return new D1PreparedStatementWrapper(this.db, this.query, values);
  }

  async first<T = any>(): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const result = stmt.get(...this.params) as T | undefined;
    return result || null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params) as T[];
    return { results };
  }

  async run(): Promise<{ success: boolean }> {
    const stmt = this.db.prepare(this.query);
    stmt.run(...this.params);
    return { success: true };
  }
}

export class D1DatabaseWrapper {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  prepare(query: string) {
    return new D1PreparedStatementWrapper(this.db, query);
  }

  exec(query: string) {
    this.db.exec(query);
  }
}
