import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, decryptOrPassthrough } from '../src/lib/crypto';

const TEST_KEY = 'a]V3$kP9mN7wQ2xR8jF5tL0yB6cH4dG'; // exactly 32 chars

describe('encrypt/decrypt', () => {
  it('round-trips a simple string', async () => {
    const plaintext = 'hello world';
    const encrypted = await encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips JSON token data', async () => {
    const tokens = JSON.stringify({ accessToken: 'ya29.abc', refreshToken: '1//xyz', expiresAt: 1234567890 });
    const encrypted = await encrypt(tokens, TEST_KEY);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(tokens);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const plaintext = 'same input';
    const a = await encrypt(plaintext, TEST_KEY);
    const b = await encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with wrong key', async () => {
    const encrypted = await encrypt('secret', TEST_KEY);
    const wrongKey = 'b]W4$lQ0nO8xR3yS9kG6uM1zA7dI5eH';
    await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
  });
});

describe('decryptOrPassthrough', () => {
  it('decrypts encrypted values', async () => {
    const encrypted = await encrypt('token-data', TEST_KEY);
    const result = await decryptOrPassthrough(encrypted, TEST_KEY);
    expect(result).toBe('token-data');
  });

  it('passes through plain text (legacy unencrypted tokens)', async () => {
    const plainJson = '{"accessToken":"ya29.abc","refreshToken":"1//xyz"}';
    const result = await decryptOrPassthrough(plainJson, TEST_KEY);
    expect(result).toBe(plainJson);
  });
});
