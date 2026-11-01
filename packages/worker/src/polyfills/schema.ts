import Database from 'better-sqlite3';
import type { D1DatabaseWrapper } from './d1';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

interface ForeignKeyInfo {
  from: string;
  table: string;
  to: string;
  on_delete: string;
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

// Brings the Node (SQLite) database up to schema.sql on every boot. schema.sql
// only uses CREATE ... IF NOT EXISTS, so on its own it never adds columns to
// tables created by an older release. This adds those columns first, then runs
// schema.sql to create any missing tables and indexes. Returns "table.column"
// for every column it added.
export function applySchema(db: D1DatabaseWrapper, schemaSql: string): string[] {
  const reference = new Database(':memory:');
  const added: string[] = [];
  try {
    reference.exec(schemaSql);
    const tables = reference
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    for (const { name: table } of tables) {
      const { results: live } = db.prepare(`PRAGMA table_info(${quote(table)})`).executeSync<{ name: string }>();
      if (live.length === 0) continue; // missing table: created by schema.sql below

      const liveColumns = new Set(live.map((c) => c.name));
      const columns = reference.prepare(`PRAGMA table_info(${quote(table)})`).all() as ColumnInfo[];
      const foreignKeys = reference.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as ForeignKeyInfo[];

      for (const column of columns) {
        if (liveColumns.has(column.name)) continue;
        db.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${columnDefinition(column, foreignKeys)}`);
        added.push(`${table}.${column.name}`);
      }
    }
  } finally {
    reference.close();
  }

  db.exec(schemaSql);
  return added;
}

function columnDefinition(column: ColumnInfo, foreignKeys: ForeignKeyInfo[]): string {
  let definition = `${quote(column.name)} ${column.type}`;
  // ADD COLUMN only accepts constant defaults, and NOT NULL only together with one.
  const hasConstantDefault = column.dflt_value !== null && !/\(|CURRENT_/i.test(column.dflt_value);
  if (hasConstantDefault) {
    definition += ` DEFAULT ${column.dflt_value}`;
    if (column.notnull) definition += ' NOT NULL';
  }
  const fk = foreignKeys.find((f) => f.from === column.name);
  if (fk) definition += ` REFERENCES ${quote(fk.table)}(${quote(fk.to)}) ON DELETE ${fk.on_delete}`;
  return definition;
}
