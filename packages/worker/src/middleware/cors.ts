import { cors } from 'hono/cors';
import type { Env } from '../types/env';

export function corsMiddleware() {
  return cors({
    origin: (origin, c) => {
      const env = c.env as Env;
      const allowed = [env.FRONTEND_URL];
      if (allowed.includes(origin)) {
        return origin;
      }
      // Only allow localhost in development (when FRONTEND_URL is localhost)
      const isDev = env.FRONTEND_URL?.includes('localhost');
      if (isDev && origin && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin;
      }
      return '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 86400,
  });
}
