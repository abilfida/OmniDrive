import { describe, it, expect } from 'vitest';
import { checkNodeEnv, resolveClientIp } from '../src/lib/node-env';

const STRONG = 'a'.repeat(32);

describe('checkNodeEnv', () => {
  it('reports an error when JWT_SECRET is missing or empty', () => {
    expect(checkNodeEnv({ TOKEN_ENCRYPTION_KEY: STRONG }).errors).toContain('JWT_SECRET is required');
    expect(checkNodeEnv({ JWT_SECRET: '', TOKEN_ENCRYPTION_KEY: STRONG }).errors).toContain('JWT_SECRET is required');
  });

  it('reports an error when TOKEN_ENCRYPTION_KEY is missing or blank', () => {
    expect(checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: '   ' }).errors).toContain('TOKEN_ENCRYPTION_KEY is required');
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(checkNodeEnv({ JWT_SECRET: 'short', TOKEN_ENCRYPTION_KEY: STRONG }).errors)
      .toEqual(['JWT_SECRET must be at least 32 characters']);
  });

  it('only warns on a short TOKEN_ENCRYPTION_KEY so existing encrypted data stays readable', () => {
    const result = checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: 'short' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('TOKEN_ENCRYPTION_KEY is shorter than 32 characters');
  });

  it('warns when Google credentials or public URLs are not set', () => {
    const { warnings } = checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: STRONG });
    expect(warnings).toContain('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set; Google Drive features will not work');
    expect(warnings).toContain('FRONTEND_URL is not set; defaulting to http://localhost:8080 (requests from other origins will fail the CSRF check)');
    expect(warnings).toContain('WORKER_URL is not set; defaulting to http://localhost:8080 (requests from other origins will fail the CSRF check)');
  });

  it('names only the URL that is missing', () => {
    const { warnings } = checkNodeEnv({ JWT_SECRET: STRONG, TOKEN_ENCRYPTION_KEY: STRONG, FRONTEND_URL: 'https://drive.example.com' });
    expect(warnings.filter((w) => w.includes('_URL'))).toEqual([
      'WORKER_URL is not set; defaulting to http://localhost:8080 (requests from other origins will fail the CSRF check)',
    ]);
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

describe('resolveClientIp', () => {
  it('uses the socket address by default and ignores forwarding headers', () => {
    expect(resolveClientIp('203.0.113.7', '1.2.3.4', false)).toBe('203.0.113.7');
  });

  it("behind a trusted proxy, uses the address the proxy appended last", () => {
    expect(resolveClientIp('172.17.0.1', 'spoofed, 198.51.100.4', true)).toBe('198.51.100.4');
  });

  it('falls back to the socket address when a trusted proxy sent no header', () => {
    expect(resolveClientIp('172.17.0.1', undefined, true)).toBe('172.17.0.1');
    expect(resolveClientIp(undefined, undefined, false)).toBe('unknown');
  });
});
