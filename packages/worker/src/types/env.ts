export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  WORKER_URL: string;
  JWT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  CLIENT_IP?: string; // Node server only: rate-limit key resolved from the socket
}

export interface SessionData {
  userId: string;
  username: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'super_admin' | 'member';
  createdAt: number;
  refreshedAt?: number; // last time the sliding TTL was extended
}

export type AppContext = {
  Bindings: Env;
  Variables: {
    userId: string;
    session: SessionData;
    s3WorkspaceId?: string | null;
  };
};

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
