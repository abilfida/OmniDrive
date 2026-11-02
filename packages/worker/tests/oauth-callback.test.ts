import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, seedUser, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

describe('Google Drive connect callback', () => {
  let t: TestEnv;

  beforeEach(() => {
    t = createTestEnv();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
      }
      if (url.includes('/oauth2/v2/userinfo')) {
        return Response.json({ id: 'google-123', email: 'shared@gmail.test', name: 'Shared' });
      }
      return Response.json({}); // anything else (initial sync) is irrelevant here
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const connect = async (sid: string, state: string) => {
    await t.env.KV.put(`oauth_state:${state}`, JSON.stringify({ codeVerifier: 'verifier' }));
    return app.request(`/api/auth/callback?code=c&state=${state}`, {
      headers: { Cookie: `omnidrive_sid=${sid}; oauth_state=${state}`, Origin: FRONTEND_URL },
    }, t.env, t.ctx);
  };

  it('lets a second user connect a Google account another user already linked', async () => {
    const alice = await seedUser(t, 'alice');
    const bob = await seedUser(t, 'bob');

    expect((await connect(alice, 's1')).status).toBe(302);
    const res = await connect(bob, 's2');

    expect(res.status).toBe(302); // was a 500 from the UNIQUE users.google_id
    const drives = (await t.db.prepare("SELECT user_id FROM drive_accounts WHERE google_account_id = 'google-123' ORDER BY user_id").all()).results;
    expect(drives).toEqual([{ user_id: 'alice' }, { user_id: 'bob' }]);
  });
});
