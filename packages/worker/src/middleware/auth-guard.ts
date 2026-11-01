import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppContext, SessionData } from '../types/env';
import { AppError } from './error-handler';

const MAX_SESSION_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days absolute max
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days sliding window
// KV allows about one write per second per key (and 1k writes/day on the free
// plan), so the sliding window is extended at most once a day, not per request.
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

export const authGuard = createMiddleware<AppContext>(async (c, next) => {
  const cookie = getCookie(c, 'omnidrive_sid');
  if (!cookie) {
    throw new AppError(401, 'Not authenticated');
  }

  const sessionJson = await c.env.KV.get(`session:${cookie}`);
  if (!sessionJson) {
    throw new AppError(401, 'Session expired');
  }

  const session: SessionData = JSON.parse(sessionJson);

  // Enforce absolute session lifetime
  if (session.createdAt && Date.now() - session.createdAt > MAX_SESSION_AGE) {
    await c.env.KV.delete(`session:${cookie}`);
    throw new AppError(401, 'Session expired');
  }

  c.set('userId', session.userId);
  c.set('session', session);

  // Sliding window: extend the session TTL when it was last refreshed over a day ago
  const lastRefresh = session.refreshedAt ?? session.createdAt ?? 0;
  if (Date.now() - lastRefresh > REFRESH_INTERVAL) {
    await c.env.KV.put(`session:${cookie}`, JSON.stringify({ ...session, refreshedAt: Date.now() }), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }

  await next();
});
