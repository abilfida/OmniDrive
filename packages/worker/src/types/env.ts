export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  WORKER_URL: string;
  JWT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}

export interface SessionData {
  userId: string;
  username: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'super_admin' | 'member';
  createdAt: number;
}

export type AppContext = {
  Bindings: Env;
  Variables: {
    userId: string;
    session: SessionData;
  };
};

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
