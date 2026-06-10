export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

export function validateWebhookUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid webhook URL';
  }

  if (parsed.protocol !== 'https:') return 'Webhook URL must use HTTPS';

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') {
    return 'Webhook URL must not point to private/internal addresses';
  }

  // Block cloud metadata
  if (hostname === '169.254.169.254') {
    return 'Webhook URL must not point to private/internal addresses';
  }

  // Block private IP ranges
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    // 10.0.0.0/8
    if (a === 10) return 'Webhook URL must not point to private/internal addresses';
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return 'Webhook URL must not point to private/internal addresses';
    // 192.168.0.0/16
    if (a === 192 && b === 168) return 'Webhook URL must not point to private/internal addresses';
  }

  return null;
}
