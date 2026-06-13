import { app } from './packages/worker/src/index.ts';
import { Env } from './packages/worker/src/types/env.ts';
import { D1DatabaseWrapper } from './packages/worker/src/polyfills/d1.ts';
import { KVNamespaceWrapper } from './packages/worker/src/polyfills/kv.ts';

const d1 = new D1DatabaseWrapper('/app/data/omnidrive.sqlite');
const kv = new KVNamespaceWrapper('/app/data/kv.sqlite');

const env = {
  DB: d1 as any,
  KV: kv as any,
  JWT_SECRET: 'dev-secret'
};

async function run() {
  const req = new Request('http://localhost/api/drives/0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd/folders/root', {
    headers: {
      'Authorization': 'Bearer test' // dummy, we will mock authGuard
    }
  });
  
  // mock authGuard by directly calling the route handler
  // Wait, easier: just create a test route
  app.get('/test-route', async (c) => {
    const db = c.env.DB;
    const subfolderResult = await db.prepare('SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id IS NULL').bind('0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd').all();
    return c.json(subfolderResult);
  });

  const res = await app.request('/test-route', {}, env);
  console.log(await res.text());
}
run().catch(console.error);
