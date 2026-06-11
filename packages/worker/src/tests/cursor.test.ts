import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../lib/cursor';

describe('cursor utils', () => {
  it('should encode and decode a valid cursor', () => {
    const cursorObj = { name: 'file.txt', id: '123' };
    const encoded = encodeCursor(cursorObj);
    expect(typeof encoded).toBe('string');
    
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(cursorObj);
  });

  it('should return null for invalid base64 decode', () => {
    expect(decodeCursor('invalid-base64-string!')).toBeNull();
  });
});
