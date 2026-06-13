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
  await kv.put('session:mock-sid', JSON.stringify({ userId: 'ba0d0422-e28b-4da6-96bf-201254ea957e', createdAt: Date.now() }));
  
  app.get('/test-get', async (c) => {
    const req = new Request('http://localhost/api/drives/0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd/folders/root', {
      headers: {
        'Cookie': 'omnidrive_sid=mock-sid'
      }
    });
    const res = await app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
    return c.json({ status: res.status, body: await res.json() });
  });

  const res = await app.request('/test-get', {}, env);
  console.log(await res.text());
}
run().catch(console.error);
