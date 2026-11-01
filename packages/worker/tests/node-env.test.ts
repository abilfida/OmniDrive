import { describe, it, expect } from 'vitest';
import { checkNodeEnv } from '../src/lib/node-env';

const STRONG = 'a'.repeat(32);

describe('checkNodeEnv', () => {
  it('reports an error when JWT_SECRET is missing or empty', () => {
    expect(checkNodeEnv({ TOKEN_ENCRYPTION_KEY: STRONG }).errors).toContain('JWT_SECRET is required');
    expect(checkNodeEnv({ JWT_SECRET: '', TOKEN_ENCRYPTION_KEY: STRONG }).errors).toContain('JWT_SECRET is required');
  });

  it('reports an error when TOKEN_ENCRYPTION_KEY is missing or blank', () => {
    expect(checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: '   ' }).errors).toContain('TOKEN_ENCRYPTION_KEY is required');
  });

  it('warns (but does not fail) on secrets shorter than 32 characters', () => {
    const result = checkNodeEnv({ JWT_SECRET: 'short', TOKEN_ENCRYPTION_KEY: 'short' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('JWT_SECRET is shorter than 32 characters');
    expect(result.warnings).toContain('TOKEN_ENCRYPTION_KEY is shorter than 32 characters');
  });

  it('warns when Google credentials or public URLs are not set', () => {
    const { warnings } = checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: STRONG });
    expect(warnings).toContain('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set; Google Drive features will not work');
    expect(warnings).toContain('FRONTEND_URL / WORKER_URL are not set; defaulting to http://localhost:8080');
  });

  it('passes cleanly with a complete configuration', () => {
    expect(checkNodeEnv({
      JWT_SECRET: STRONG,
      TOKEN_ENCRYPTION_KEY: STRONG,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      FRONTEND_URL: 'https://drive.example.com',
      WORKER_URL: 'https://drive.example.com',
    })).toEqual({ errors: [], warnings: [] });
  });
});
