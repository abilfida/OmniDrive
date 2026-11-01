// Startup validation for the self-hosted Node server. On Cloudflare these values
// come from wrangler secrets; here they come from process.env and must never
// silently fall back to well-known defaults.

const MIN_SECRET_LENGTH = 32;

export function checkNodeEnv(env: Record<string, string | undefined>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of ['JWT_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
    const value = env[name]?.trim();
    if (!value) {
      errors.push(`${name} is required`);
    } else if (value.length < MIN_SECRET_LENGTH) {
      if (name === 'JWT_SECRET') {
        // Only signs short-lived share-link sessions, so it is always safe to replace.
        errors.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
      } else {
        // Not fatal: existing installs may already have data encrypted with a shorter key.
        warnings.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
      }
    }
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    warnings.push('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set; Google Drive features will not work');
  }
  for (const name of ['FRONTEND_URL', 'WORKER_URL']) {
    if (!env[name]) {
      warnings.push(`${name} is not set; defaulting to http://localhost:8080 (requests from other origins will fail the CSRF check)`);
    }
  }

  return { errors, warnings };
}

// Client address for rate limiting on the Node server. Forwarding headers are
// only honoured behind a trusted reverse proxy (TRUST_PROXY=true); the last
// X-Forwarded-For entry is the one that proxy appended, earlier ones are
// client-controlled.
export function resolveClientIp(socketAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string {
  if (trustProxy && forwardedFor) {
    const last = forwardedFor.split(',').map((part) => part.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return socketAddress || 'unknown';
}
