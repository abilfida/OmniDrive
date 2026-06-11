import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../lib/cursor';

describe('cursor utils', () => {
  it('should encode and decode a valid cursor', () => {
    const cursorObj = { name: 'file.txt', id: '123' };
    const encoded = encodeCursor(cursorObj);
    expect(typeof encoded).toBe('string');
    
    // Ensure URL safety
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(cursorObj);
  });

  it('should return null for invalid base64 decode', () => {
    expect(decodeCursor('invalid-base64-string!')).toBeNull();
  });

  it('should support non-latin1 characters (utf-8)', () => {
    const cursorObj = { name: 'файл.txt', query: '🔥' };
    const encoded = encodeCursor(cursorObj);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(cursorObj);
  });

  it('should support generic types', () => {
    interface MyCursor {
      offset: number;
    }
    const cursorObj: MyCursor = { offset: 42 };
    const encoded = encodeCursor<MyCursor>(cursorObj);
    const decoded = decodeCursor<MyCursor>(encoded);
    expect(decoded?.offset).toBe(42);
  });
});
