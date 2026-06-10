import { describe, it, expect } from 'vitest';
import { generatePKCE } from '../src/lib/pkce';

describe('generatePKCE', () => {
  it('returns codeVerifier and codeChallenge', async () => {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();
    expect(typeof codeVerifier).toBe('string');
    expect(typeof codeChallenge).toBe('string');
  });

  it('codeVerifier is URL-safe (no +, /, =)', async () => {
    const { codeVerifier } = await generatePKCE();
    expect(codeVerifier).not.toMatch(/[+/=]/);
  });

  it('codeChallenge is URL-safe (no +, /, =)', async () => {
    const { codeChallenge } = await generatePKCE();
    expect(codeChallenge).not.toMatch(/[+/=]/);
  });

  it('codeVerifier has sufficient length (>= 43 chars per RFC 7636)', async () => {
    const { codeVerifier } = await generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it('generates different values each time', async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});
