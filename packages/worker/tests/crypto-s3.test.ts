import { describe, it, expect } from 'vitest';
import { calculateMD5ForStream, sha256, hmacSha256, getMD5HashingStream } from '../src/lib/crypto-s3';

describe('crypto-s3', () => {
  describe('calculateMD5ForStream', () => {
    it('calculates MD5 digest of a stream', async () => {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('hello'));
          controller.enqueue(encoder.encode(' '));
          controller.enqueue(encoder.encode('world'));
          controller.close();
        }
      });

      const result = await calculateMD5ForStream(readable);
      // MD5 for "hello world" is "5eb63bbbe01eeed093cb22bb8f5acdc3"
      expect(result.md5Hex).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
    });

    it('calculates MD5 digest of an empty stream', async () => {
      const readable = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });

      const result = await calculateMD5ForStream(readable);
      // MD5 for empty string is "d41d8cd98f00b204e9800998ecf8427e"
      expect(result.md5Hex).toBe('d41d8cd98f00b204e9800998ecf8427e');
    });

    it('reconstructs the stream with identical contents', async () => {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('chunk1'));
          controller.enqueue(encoder.encode('chunk2'));
          controller.close();
        }
      });

      const result = await calculateMD5ForStream(readable);
      expect(result.md5Hex).toBeDefined();

      // Read reconstructed stream
      const reader = result.stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const decoder = new TextDecoder();
      const reconstructedText = chunks.map(c => decoder.decode(c)).join('');
      expect(reconstructedText).toBe('chunk1chunk2');
    });
  });

  describe('getMD5HashingStream', () => {
    it('hashes stream on the fly', async () => {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('hello'));
          controller.enqueue(encoder.encode(' '));
          controller.enqueue(encoder.encode('world'));
          controller.close();
        }
      });
      const { stream, getHash } = getMD5HashingStream();
      const piped = readable.pipeThrough(stream);
      
      const reader = piped.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      
      const hashVal = getHash();
      expect(hashVal).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
      
      const decoder = new TextDecoder();
      const reconstructedText = chunks.map(c => decoder.decode(c)).join('');
      expect(reconstructedText).toBe('hello world');
    });
  });

  describe('sha256', () => {
    it('calculates SHA256 hex string correctly', () => {
      // SHA256 of "hello world" is "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
      expect(sha256('hello world')).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
      expect(sha256(new TextEncoder().encode('hello world'))).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });
  });

  describe('hmacSha256', () => {
    it('calculates HMAC-SHA256 digest correctly', () => {
      const key = 'secret-key';
      const data = 'message';
      const result = hmacSha256(key, data);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString('hex')).toBe('287a3bd8a4fc7731a94c722079055323644d8798bd291bf9878abc9b8fd4b1d0');
    });
  });
});
