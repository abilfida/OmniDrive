import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestEnv, seedUser, apiRequest, type TestEnv } from './helpers/app-harness';

const DAY = 24 * 60 * 60 * 1000;

describe('session refresh and request limits', () => {
  let t: TestEnv;
  let sid: string;

  beforeEach(async () => {
    t = createTestEnv();
    sid = await seedUser(t, 'u1');
  });

  it('does not write the session back to KV on every request', async () => {
    const put = vi.spyOn(t.env.KV, 'put');
    for (let i = 0; i < 3; i++) {
      expect((await apiRequest(t, sid, 'GET', '/api/auth/me')).status).toBe(200);
    }
    expect(put).not.toHaveBeenCalled();
  });

  it('extends the session at most once a day', async () => {
    const stale = { userId: 'u1', username: 'u1', role: 'member', createdAt: Date.now() - 2 * DAY };
    await t.env.KV.put(`session:${sid}`, JSON.stringify(stale));
    const put = vi.spyOn(t.env.KV, 'put');

    await apiRequest(t, sid, 'GET', '/api/auth/me');
    await apiRequest(t, sid, 'GET', '/api/auth/me');

    expect(put).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(put.mock.calls[0][1] as string);
    expect(saved.refreshedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(saved.createdAt).toBe(stale.createdAt); // absolute lifetime still counts from login
  });

  it('rejects oversized JSON bodies before parsing them', async () => {
    const res = await apiRequest(t, sid, 'POST', '/api/automations', { name: 'x'.repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});
