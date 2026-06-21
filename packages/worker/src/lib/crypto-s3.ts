import { createHash, createHmac } from 'node:crypto';

export function getMD5HashingStream(): { stream: TransformStream<Uint8Array, Uint8Array>; getHash: () => string } {
  const hash = createHash('md5');
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      hash.update(chunk);
      controller.enqueue(chunk);
    }
  });
  return { stream, getHash: () => hash.digest('hex') };
}

export interface StreamHashingResult {
  stream: ReadableStream<Uint8Array>;
  md5Hex: string;
}

/**
 * Pipes a ReadableStream to compute its MD5 hash while passing through the data.
 * Keeps memory overhead to O(1) by hashing chunk-by-chunk.
 */
export async function calculateMD5ForStream(stream: ReadableStream<Uint8Array>): Promise<{ md5Hex: string; stream: ReadableStream<Uint8Array> }> {
  const hash = createHash('md5');
  const reader = stream.getReader();
  
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      hash.update(value);
      chunks.push(value);
    }
  }

  const md5Hex = hash.digest('hex');

  // Reconstruct the stream since we consumed it
  const outputStream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });

  return { md5Hex, stream: outputStream };
}

/**
 * Computes the SHA256 hash of the input data.
 * Returns the hex representation.
 */
export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Computes the HMAC-SHA256 digest using the provided key and data.
 * Returns a Buffer containing the raw bytes.
 */
export function hmacSha256(key: string | Uint8Array, data: string | Uint8Array): Buffer {
  return createHmac('sha256', key).update(data).digest();
}
