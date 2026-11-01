import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import { app } from './index';
import { setShuttingDown } from './services/sync';
import worker from './index';
import { D1DatabaseWrapper } from './polyfills/d1';
import { KVNamespaceWrapper } from './polyfills/kv';
import { applySchema } from './polyfills/schema';
import dotenv from 'dotenv';
import type { Env } from './types/env';
import { checkNodeEnv, resolveClientIp } from './lib/node-env';

dotenv.config();

const envCheck = checkNodeEnv(process.env);
for (const warning of envCheck.warnings) console.warn(`[config] WARNING: ${warning}`);
if (envCheck.errors.length > 0) {
  for (const error of envCheck.errors) console.error(`[config] ERROR: ${error}`);
  console.error('[config] Generate secrets with: openssl rand -hex 32');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize DB and bring it up to the current schema (new and upgraded volumes alike)
const dbPath = path.join(dataDir, 'omnidrive.sqlite');
const d1 = new D1DatabaseWrapper(dbPath);

// The Docker image ships schema.sql next to the bundle; local runs use the source tree.
const schemaPath = [
  path.join(__dirname, 'src/db/schema.sql'),
  path.join(process.cwd(), 'src/db/schema.sql'),
].find((p) => fs.existsSync(p));
if (!schemaPath) {
  console.error('[db] ERROR: src/db/schema.sql not found next to the server bundle or in the working directory');
  process.exit(1);
}
const addedColumns = applySchema(d1, fs.readFileSync(schemaPath, 'utf-8'));
if (addedColumns.length > 0) console.log(`[db] Added missing columns: ${addedColumns.join(', ')}`);
console.log('Database schema is up to date.');

// Startup cleanup: reset stuck syncing states
d1.exec("UPDATE sync_state SET status = 'error', error_message = 'Sync interrupted by server restart' WHERE status = 'syncing'");

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
  // Validated by checkNodeEnv above; used verbatim so existing encrypted data stays readable.
  JWT_SECRET: process.env.JWT_SECRET!,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY!,
};

// Serve static React files from /usr/share/nginx/html or local web/dist
const staticDir = process.env.STATIC_DIR || path.join(process.cwd(), '../web/dist');
app.use('/*', serveStatic({ root: staticDir }));

// SPA Fallback: Serve index.html for all non-API routes that didn't match a static file
app.get('*', (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.notFound();
  }
  const indexPath = path.join(staticDir, 'index.html');
  try {
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    return c.html(indexHtml);
  } catch (err) {
    return c.text('index.html not found in ' + staticDir, 404);
  }
});

// Construct a dummy execution context for waitUntil
const dummyCtx = {
  waitUntil: (promise: Promise<any>) => promise.catch(console.error),
  passThroughOnException: () => {}
} as any;

// Setup Cron Schedule
const CRON_SCHEDULE = '*/30 * * * *';
cron.schedule(CRON_SCHEDULE, () => {
  console.log('Executing cron schedule...');
  if (worker.scheduled) {
    worker.scheduled({ cron: CRON_SCHEDULE, type: 'cron', scheduledTime: Date.now() }, nodeEnv, dummyCtx);
  }
});

const port = parseInt(process.env.PORT || '8080', 10);
console.log(`Starting Node server on port ${port}...`);

const trustProxy = process.env.TRUST_PROXY === 'true';

const server = serve({
  // @hono/node-server passes the raw Node request as `incoming`; its socket
  // address (not a client-sent header) is what rate limiting keys on.
  fetch: (req: any, bindings: any) => {
    const incoming = bindings.incoming as import('http').IncomingMessage;
    const forwardedFor = incoming.headers['x-forwarded-for'];
    const clientIp = resolveClientIp(
      incoming.socket.remoteAddress,
      Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor,
      trustProxy
    );
    return app.fetch(req, { ...nodeEnv, CLIENT_IP: clientIp }, dummyCtx);
  },
  port
});

function shutdown(signal: string) {
  console.log(`${signal} received. Initiating graceful shutdown...`);
  setShuttingDown();
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
