import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { D1DatabaseWrapper } from '../src/polyfills/d1';
import { KVNamespaceWrapper } from '../src/polyfills/kv';

const dirs: string[] = [];
const tempFile = (name: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidrive-sqlite-'));
  dirs.push(dir);
  return path.join(dir, name);
};
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('Node SQLite runtime settings', () => {
  it('opens the database in WAL mode with a busy timeout', () => {
    const file = tempFile('omnidrive.sqlite');
    const db = new D1DatabaseWrapper(file);
    db.close();
    const raw = new Database(file);
    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
    raw.close();
  });

  it('applies the busy timeout to the D1 and KV connections', () => {
    const d1 = new D1DatabaseWrapper(tempFile('a.sqlite'));
    const kv = new KVNamespaceWrapper(tempFile('kv.sqlite'));
    expect(d1.pragma('busy_timeout')).toBe(5000);
    expect(kv.pragma('busy_timeout')).toBe(5000);
    d1.close();
    kv.close();
  });

  it('purges expired KV keys that are never read again', async () => {
    const kv = new KVNamespaceWrapper(tempFile('kv.sqlite'));
    await kv.put('fresh', 'a', { expirationTtl: 3600 });
    await kv.put('forever', 'b');
    await kv.put('stale', 'c', { expirationTtl: 60 });
    kv.pragma('busy_timeout'); // touch the connection
    // Backdate one key's expiry instead of waiting for it.
    (kv as any).db.prepare("UPDATE kv_store SET expiration = 1 WHERE id = 'stale'").run();

    expect(kv.purgeExpired()).toBe(1);
    expect(await kv.get('fresh')).toBe('a');
    expect(await kv.get('forever')).toBe('b');
    expect((kv as any).db.prepare('SELECT COUNT(*) AS n FROM kv_store').get().n).toBe(2);
    kv.close();
  });
});
