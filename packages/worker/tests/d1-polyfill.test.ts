import { describe, it, expect, beforeEach } from 'vitest';
import { D1DatabaseWrapper } from '../src/polyfills/d1';

describe('D1DatabaseWrapper (Node polyfill)', () => {
  let db: D1DatabaseWrapper;

  beforeEach(() => {
    db = new D1DatabaseWrapper(':memory:');
    db.exec(`
      CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id), flag INTEGER);
    `);
  });

  it('run() reports changes and last_row_id in meta like D1', async () => {
    const insert = await db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p1', 'a').run();
    expect(insert.success).toBe(true);
    expect(insert.meta.changes).toBe(1);
    expect(typeof insert.meta.last_row_id).toBe('number');

    const noop = await db.prepare('UPDATE parents SET name = ? WHERE id = ?').bind('b', 'missing').run();
    expect(noop.meta.changes).toBe(0);
  });

  it('all() returns results alongside success and meta', async () => {
    await db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p1', 'a').run();
    const res = await db.prepare('SELECT * FROM parents').all();
    expect(res.success).toBe(true);
    expect(res.results).toEqual([{ id: 'p1', name: 'a' }]);
    expect(res.meta).toBeDefined();
  });

  it('batch() runs every statement and returns one result per statement', async () => {
    const results = await db.batch([
      db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p1', 'a'),
      db.prepare('INSERT INTO children (id, parent_id) VALUES (?, ?)').bind('c1', 'p1'),
      db.prepare('SELECT id FROM children'),
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].meta.changes).toBe(1);
    expect(results[2].results).toEqual([{ id: 'c1' }]);
  });

  it('batch() is atomic: a failing statement rolls back the earlier ones', async () => {
    await expect(db.batch([
      db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p1', 'a'),
      db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p2', 'a'), // UNIQUE violation
    ])).rejects.toThrow();
    const { results } = await db.prepare('SELECT * FROM parents').all();
    expect(results).toEqual([]);
  });

  it('coerces boolean bind values to 1/0 like D1', async () => {
    await db.prepare('INSERT INTO parents (id, name) VALUES (?, ?)').bind('p1', 'a').run();
    await db.prepare('INSERT INTO children (id, parent_id, flag) VALUES (?, ?, ?)').bind('c1', 'p1', true).run();
    const row = await db.prepare('SELECT flag FROM children WHERE id = ?').bind('c1').first<{ flag: number }>();
    expect(row?.flag).toBe(1);
  });

  it('enforces foreign keys like D1', async () => {
    await expect(
      db.prepare('INSERT INTO children (id, parent_id) VALUES (?, ?)').bind('c1', 'nope').run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
