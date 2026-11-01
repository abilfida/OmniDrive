import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createTestEnv, FRONTEND_URL, type TestEnv } from './helpers/app-harness';

const PASSWORD = 'Str0ngPassw0rd';

describe('registration', () => {
  let t: TestEnv;
  let ip = 0;

  beforeEach(() => {
    t = createTestEnv();
  });

  const register = (body: Record<string, unknown>) =>
    app.request('/api/auth/register', {
      method: 'POST',
      // A distinct client per request keeps the register rate limit out of the way.
      headers: { 'Content-Type': 'application/json', Origin: FRONTEND_URL, 'X-Real-IP': `reg-${++ip}` },
      body: JSON.stringify({ password: PASSWORD, ...body }),
    }, t.env, t.ctx);

  const count = async (sql: string) => (await t.db.prepare(sql).first<{ n: number }>())!.n;

  it('creates exactly one super admin when two first registrations race', async () => {
    const results = await Promise.all([register({ username: 'alice' }), register({ username: 'bob' })]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE is_super_admin = 1')).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(1);
  });

  describe('with an invitation code', () => {
    beforeEach(async () => {
      expect((await register({ username: 'admin' })).status).toBe(200);
      await t.db.prepare("INSERT INTO invitation_codes (id, code, max_uses, used_count, created_by) VALUES ('inv-1', 'ONCE', 1, 0, (SELECT id FROM users))").run();
    });

    it('does not burn the code when the registration is rejected', async () => {
      expect((await register({ username: 'admin', invitation_code: 'ONCE' })).status).toBe(400);
      expect(await count("SELECT used_count AS n FROM invitation_codes WHERE id = 'inv-1'")).toBe(0);
      expect((await register({ username: 'carol', invitation_code: 'ONCE' })).status).toBe(200);
    });

    it('never exceeds max_uses under concurrent registrations', async () => {
      const results = await Promise.all([
        register({ username: 'carol', invitation_code: 'ONCE' }),
        register({ username: 'dave', invitation_code: 'ONCE' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await count("SELECT used_count AS n FROM invitation_codes WHERE id = 'inv-1'")).toBe(1);
      expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(2);
    });
  });
});
