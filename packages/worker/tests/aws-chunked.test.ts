import { describe, it, expect } from 'vitest';
import { createAwsChunkedDecoder, isAwsChunked } from '../src/lib/aws-chunked';

const enc = new TextEncoder();

// Feeds `body` to the decoder split into pieces of `pieceSize` bytes.
async function decode(body: string, pieceSize: number): Promise<string> {
  const bytes = enc.encode(body);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += pieceSize) controller.enqueue(bytes.slice(i, i + pieceSize));
      controller.close();
    },
  });
  return new Response(source.pipeThrough(createAwsChunkedDecoder())).text();
}

const SIGNED = '5;chunk-signature=aaaa\r\nhello\r\n6;chunk-signature=bbbb\r\n world\r\n0;chunk-signature=cccc\r\n\r\n';
const UNSIGNED_WITH_TRAILER = '5\r\nhello\r\n6\r\n world\r\n0\r\nx-amz-checksum-crc32:AAAAAA==\r\n\r\n';

describe('aws-chunked decoder', () => {
  it.each([1, 3, 7, 1000])('decodes signed chunks fed %i bytes at a time', async (piece) => {
    expect(await decode(SIGNED, piece)).toBe('hello world');
  });

  it.each([1, 4, 1000])('decodes unsigned chunks and ignores the checksum trailer (%i-byte pieces)', async (piece) => {
    expect(await decode(UNSIGNED_WITH_TRAILER, piece)).toBe('hello world');
  });

  it('rejects a truncated body instead of storing a partial object', async () => {
    await expect(decode('5;chunk-signature=a\r\nhel', 4)).rejects.toThrow();
  });

  it('rejects a malformed chunk header', async () => {
    await expect(decode('zz;chunk-signature=a\r\nhello\r\n', 100)).rejects.toThrow();
  });

  it('detects aws-chunked requests', () => {
    expect(isAwsChunked(new Headers({ 'x-amz-content-sha256': 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD' }))).toBe(true);
    expect(isAwsChunked(new Headers({ 'x-amz-content-sha256': 'STREAMING-UNSIGNED-PAYLOAD-TRAILER' }))).toBe(true);
    expect(isAwsChunked(new Headers({ 'content-encoding': 'aws-chunked' }))).toBe(true);
    expect(isAwsChunked(new Headers({ 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' }))).toBe(false);
  });
});
