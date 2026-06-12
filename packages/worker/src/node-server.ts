import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import { app } from './index';
import worker from './index';
import { D1DatabaseWrapper } from './polyfills/d1';
import { KVNamespaceWrapper } from './polyfills/kv';
import dotenv from 'dotenv';
import type { Env } from './types/env';

dotenv.config();

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize DB and run migrations if empty
const dbPath = path.join(dataDir, 'omnidrive.sqlite');
const isNewDb = !fs.existsSync(dbPath);
const d1 = new D1DatabaseWrapper(dbPath);

if (isNewDb) {
  const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    d1.exec(fs.readFileSync(schemaPath, 'utf-8'));
    console.log('Database schema initialized.');
  }
}

// Initialize KV
const kv = new KVNamespaceWrapper(path.join(dataDir, 'kv.sqlite'));

// Construct Cloudflare Env mock
const nodeEnv: Env = {
  DB: d1 as any,
  KV: kv as any,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8080',
  WORKER_URL: process.env.WORKER_URL || 'http://localhost:8080',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || 'dev-encryption-key-32-bytes-long!',
};

// Serve static React files from /usr/share/nginx/html or local web/dist
const staticDir = process.env.STATIC_DIR || path.join(process.cwd(), '../web/dist');
app.use('/*', serveStatic({ root: staticDir }));

// Construct a dummy execution context for waitUntil
const dummyCtx = {
  waitUntil: (promise: Promise<any>) => promise.catch(console.error),
  passThroughOnException: () => {}
} as any;

// Setup Cron Schedule
cron.schedule('*/30 * * * *', () => {
  console.log('Executing cron schedule...');
  if (worker.scheduled) {
    worker.scheduled({ cron: '*/30 * * * *', type: 'cron', scheduledTime: Date.now() }, nodeEnv, dummyCtx);
  }
});

const port = parseInt(process.env.PORT || '8080', 10);
console.log(`Starting Node server on port ${port}...`);

serve({
  fetch: (req) => app.fetch(req, nodeEnv, dummyCtx),
  port
});
