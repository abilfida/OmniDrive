const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const raw = encoder.encode(secret).slice(0, 32);
  // AES requires key of exactly 16, 24, or 32 bytes — pad to 32
  const keyBytes = new Uint8Array(32);
  keyBytes.set(raw);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Format: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

export async function decryptOrPassthrough(value: string, secret: string): Promise<string> {
  try {
    return await decrypt(value, secret);
  } catch {
    // Value is not encrypted (legacy plain-text token) — return as-is
    return value;
  }
}
