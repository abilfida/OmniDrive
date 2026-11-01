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
      // Not fatal: existing installs may already have data encrypted with a shorter key.
      warnings.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
    }
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    warnings.push('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set; Google Drive features will not work');
  }
  if (!env.FRONTEND_URL || !env.WORKER_URL) {
    warnings.push('FRONTEND_URL / WORKER_URL are not set; defaulting to http://localhost:8080');
  }

  return { errors, warnings };
}
