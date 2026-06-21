import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';
import { encrypt } from '../src/lib/crypto';
import { hmacSha256, sha256 } from '../src/lib/crypto-s3';

const TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-which-is-long-enough';
const ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const USER_ID = 'test-user-id';

function calculateSigV4({
  method,
  path,
  queryParams = {},
  headers = {},
  payload = '',
  accessKeyId = ACCESS_KEY_ID,
  secretAccessKey = SECRET_ACCESS_KEY,
  region = 'us-east-1',
  service = 's3',
  dateStr = '20260621',
  amzDate = '20260621T120000Z'
}: {
  method: string;
  path: string;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  payload?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  service?: string;
  dateStr?: string;
  amzDate?: string;
}) {
  function awsEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  const queryParamsList: [string, string][] = Object.entries(queryParams);
  queryParamsList.sort((a, b) => {
    const aKey = awsEncode(a[0]);
    const bKey = awsEncode(b[0]);
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    const aVal = awsEncode(a[1]);
    const bVal = awsEncode(b[1]);
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  const canonicalQueryString = queryParamsList
    .map(([key, val]) => `${awsEncode(key)}=${awsEncode(val)}`)
    .join('&');

  const canonicalHeadersList = Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]);
  canonicalHeadersList.sort((a, b) => {
    const aKey = a[0];
    const bKey = b[0];
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  });
  const canonicalHeaders = canonicalHeadersList
    .map(([k, v]) => `${k}:${v.trim().replace(/\s+/g, ' ')}\n`)
    .join('');

  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(';');
  const payloadHash = headers['x-amz-content-sha256'] || sha256(payload);

  const canonicalRequest = [
    method,
    path,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStr}/${region}/${service}/aws4_request`,
    sha256(canonicalRequest)
  ].join('\n');

  const kDate = hmacSha256("AWS4" + secretAccessKey, dateStr);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  return {
    signature,
    signedHeaders,
    canonicalRequest,
    stringToSign
  };
}

describe('S3 API compatibility endpoints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getMockEnv = async ({
    workspaces = [] as any[],
    workspaceResolved = null as any,
    files = [] as any[]
  } = {}) => {
    const encryptedSecret = await encrypt(SECRET_ACCESS_KEY, TOKEN_ENCRYPTION_KEY);

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            return {
              first: vi.fn(async () => {
                if (sql.includes('SELECT * FROM s3_credentials WHERE access_key_id = ?')) {
                  if (args[0] === ACCESS_KEY_ID) {
                    return {
                      id: 'cred-123',
                      user_id: USER_ID,
                      access_key_id: ACCESS_KEY_ID,
                      secret_key_enc: encryptedSecret,
                      description: 'Test Credential'
                    };
                  }
                }
                if (sql.includes('SELECT w.id FROM workspaces w')) {
                  // Resolve workspace
                  return workspaceResolved;
                }
                return null;
              }),
              all: vi.fn(async () => {
                if (sql.includes('SELECT w.id, w.name, w.created_at')) {
                  return { results: workspaces };
                }
                if (sql.includes('WITH RECURSIVE folder_path')) {
                  return { results: files };
                }
                return { results: [] };
              })
            };
          })
        };
      })
    };

    return {
      DB: mockDb as any,
      KV: {} as any,
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      FRONTEND_URL: 'http://localhost:3000',
      WORKER_URL: 'http://localhost:8787',
      JWT_SECRET: 'test-jwt-secret',
      TOKEN_ENCRYPTION_KEY: TOKEN_ENCRYPTION_KEY,
    };
  };

  it('returns 403 on s3 root without auth', async () => {
    const env = await getMockEnv();
    const response = await app.request('/s3/', { method: 'GET' }, env);
    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('<Code>AccessDenied</Code>');
  });

  it('returns 200 and list of workspaces for ListBuckets operation', async () => {
    const workspaces = [
      { id: 'ws-1', name: 'my-bucket-1', created_at: '2026-06-21 10:00:00' },
      { id: 'ws-2', name: 'my-bucket-2', created_at: '2026-06-21 11:00:00' }
    ];

    const env = await getMockEnv({ workspaces });

    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/s3/';
    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256('')
    };

    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    
    const body = await res.text();
    expect(body).toContain('<ListAllMyBucketsResult>');
    expect(body).toContain('<Bucket>');
    expect(body).toContain('<Name>my-bucket-1</Name>');
    expect(body).toContain('<Name>my-bucket-2</Name>');
    expect(body).toContain('<CreationDate>2026-06-21T10:00:00.000Z</CreationDate>');
    expect(body).toContain('<CreationDate>2026-06-21T11:00:00.000Z</CreationDate>');
    expect(body).toContain(`<ID>${USER_ID}</ID>`);
  });

  it('returns NoSuchBucket error when bucket workspace is not found', async () => {
    const env = await getMockEnv({ workspaceResolved: null });

    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/s3/non-existent-bucket';
    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256('')
    };

    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const body = await res.text();
    expect(body).toContain('<Code>NoSuchBucket</Code>');
    expect(body).toContain('<Message>Bucket not found</Message>');
  });

  it('returns 200 and list of objects (no delimiter)', async () => {
    const workspaceResolved = { id: 'ws-1' };
    const files = [
      { id: 'f-1', name: 'photo.jpg', size: 1024, updated_at: '2026-06-21 11:30:00', s3_key: 'photo.jpg' },
      { id: 'f-2', name: 'report.pdf', size: 2048, updated_at: '2026-06-21 11:45:00', s3_key: 'documents/report.pdf' }
    ];

    const env = await getMockEnv({ workspaceResolved, files });

    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/s3/my-bucket-1';
    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256('')
    };

    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const body = await res.text();
    expect(body).toContain('<ListBucketResult>');
    expect(body).toContain('<Name>my-bucket-1</Name>');
    expect(body).toContain('<Key>photo.jpg</Key>');
    expect(body).toContain('<Key>documents/report.pdf</Key>');
    expect(body).toContain('<Size>1024</Size>');
    expect(body).toContain('<Size>2048</Size>');
    expect(body).toContain('<ETag>"f-1"</ETag>');
    expect(body).toContain('<ETag>"f-2"</ETag>');
  });

  it('filters objects by prefix and handles delimiter properly', async () => {
    const workspaceResolved = { id: 'ws-1' };
    const files = [
      { id: 'f-1', name: 'photo.jpg', size: 1024, updated_at: '2026-06-21 11:30:00', s3_key: 'photo.jpg' },
      { id: 'f-2', name: 'report.pdf', size: 2048, updated_at: '2026-06-21 11:45:00', s3_key: 'documents/report.pdf' },
      { id: 'f-3', name: 'notes.txt', size: 512, updated_at: '2026-06-21 11:50:00', s3_key: 'documents/archive/notes.txt' }
    ];

    const env = await getMockEnv({ workspaceResolved, files });

    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/s3/my-bucket-1';
    const queryParams = {
      prefix: 'documents/',
      delimiter: '/'
    };

    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256('')
    };

    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      queryParams,
      headers,
      dateStr,
      amzDate
    });

    const queryString = `prefix=documents%2F&delimiter=%2F&X-Amz-Signature=${signature}`;
    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(`${path}?prefix=documents/&delimiter=/`, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(200);
    const body = await res.text();
    // 'photo.jpg' doesn't match 'documents/' prefix
    expect(body).not.toContain('<Key>photo.jpg</Key>');
    
    // 'documents/report.pdf' is in the immediate prefix folder, so it should be in Contents
    expect(body).toContain('<Key>documents/report.pdf</Key>');
    expect(body).toContain('<Size>2048</Size>');
    
    // 'documents/archive/notes.txt' is deeper than 'documents/', so 'documents/archive/' is a CommonPrefix
    expect(body).not.toContain('<Key>documents/archive/notes.txt</Key>');
    expect(body).toContain('<CommonPrefixes>');
    expect(body).toContain('<Prefix>documents/archive/</Prefix>');
  });
});
