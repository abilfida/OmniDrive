// Decoding for S3 "aws-chunked" request bodies. Current AWS SDKs send PutObject
// and UploadPart bodies as a series of `<hex size>[;chunk-signature=...]\r\n
// <data>\r\n` chunks ending with a zero-size chunk and optional checksum
// trailers. Stored as-is, that framing ends up inside the object.

export function isAwsChunked(headers: Headers): boolean {
  return (headers.get('x-amz-content-sha256') ?? '').startsWith('STREAMING-')
    || (headers.get('content-encoding') ?? '').toLowerCase().includes('aws-chunked');
}

const MAX_HEADER_LINE = 4096;

export function createAwsChunkedDecoder(): TransformStream<Uint8Array, Uint8Array> {
  let state: 'header' | 'data' | 'crlf' | 'done' = 'header';
  let header: number[] = [];
  let remaining = 0;
  let crlfLeft = 0;
  const decoder = new TextDecoder();

  return new TransformStream({
    transform(chunk, controller) {
      let i = 0;
      while (i < chunk.length && state !== 'done') {
        if (state === 'header') {
          const byte = chunk[i++];
          if (byte !== 0x0a) {
            header.push(byte);
            if (header.length > MAX_HEADER_LINE) throw new Error('Malformed aws-chunked body: chunk header too long');
            continue;
          }
          const line = decoder.decode(new Uint8Array(header)).replace(/\r$/, '');
          header = [];
          const sizeField = line.split(';')[0].trim();
          const size = /^[0-9a-fA-F]+$/.test(sizeField) ? parseInt(sizeField, 16) : NaN;
          if (!Number.isFinite(size)) throw new Error('Malformed aws-chunked body: bad chunk size');
          if (size === 0) {
            state = 'done'; // anything after this is checksum trailers
          } else {
            remaining = size;
            state = 'data';
          }
        } else if (state === 'data') {
          const take = Math.min(remaining, chunk.length - i);
          controller.enqueue(chunk.subarray(i, i + take));
          i += take;
          remaining -= take;
          if (remaining === 0) {
            state = 'crlf';
            crlfLeft = 2;
          }
        } else {
          i++;
          if (--crlfLeft === 0) state = 'header';
        }
      }
    },
    flush() {
      if (state !== 'done') throw new Error('Truncated aws-chunked body');
    },
  });
}
