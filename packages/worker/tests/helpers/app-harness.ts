// Integration harness: runs the real Hono app against an in-memory SQLite
// database (the Node D1 polyfill + schema.sql) and an in-memory KV store.
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../../src/index';
import { D1DatabaseWrapper } from '../../src/polyfills/d1';
import { KVNamespaceWrapper } from '../../src/polyfills/kv';
import { encrypt } from '../../src/lib/crypto';
import type { Env } from '../../src/types/env';

export const FRONTEND_URL = 'http://localhost:8080';
export const ENCRYPTION_KEY = 'k'.repeat(32);

const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf-8');

export function createTestEnv() {
  const db = new D1DatabaseWrapper(':memory:');
  db.exec(schema);
  const kv = new KVNamespaceWrapper(':memory:');
  const env: Env = {
    DB: db as any,
    KV: kv as any,
    FRONTEND_URL,
    WORKER_URL: FRONTEND_URL,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    JWT_SECRET: 'j'.repeat(32),
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
  };
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => { pending.push(p.catch(() => {})); },
    passThroughOnException: () => {},
  } as any;
  return { env, db, kv, ctx, settle: () => Promise.all(pending) };
}

export type TestEnv = ReturnType<typeof createTestEnv>;

export async function seedUser(t: TestEnv, userId: string, username = userId): Promise<string> {
  await t.db.prepare('INSERT INTO users (id, username, password_hash, email) VALUES (?, ?, ?, ?)')
    .bind(userId, username, 'x', `${username}@example.com`).run();
  const sid = `sid-${userId}`;
  await t.kv.put(`session:${sid}`, JSON.stringify({ userId, username, role: 'member', createdAt: Date.now() }));
  return sid;
}

export async function seedDrive(
  t: TestEnv,
  driveId: string,
  userId: string,
  opts: { totalQuota?: number; usedQuota?: number } = {}
) {
  await t.db.prepare(
    `INSERT INTO drive_accounts (id, user_id, google_account_id, email, total_quota, used_quota)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(driveId, userId, `g-${driveId}`, `${driveId}@gmail.test`, opts.totalQuota ?? 10_000, opts.usedQuota ?? 0).run();
  // Stored exactly as the OAuth callback stores them: AES-GCM encrypted JSON.
  const tokens = { accessToken: `access-${driveId}`, refreshToken: 'refresh', expiresAt: Date.now() + 3_600_000 };
  await t.kv.put(`tokens:${driveId}`, await encrypt(JSON.stringify(tokens), ENCRYPTION_KEY));
}

export function apiRequest(t: TestEnv, sid: string, method: string, url: string, body?: unknown) {
  return app.request(
    url,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: FRONTEND_URL,
        Cookie: `omnidrive_sid=${sid}`,
        'CF-Connecting-IP': `test-${sid}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    t.env,
    t.ctx
  );
}
