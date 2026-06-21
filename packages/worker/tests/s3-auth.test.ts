import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { s3AuthMiddleware } from '../src/middleware/s3-auth';
import { encrypt } from '../src/lib/crypto';
import { hmacSha256, sha256 } from '../src/lib/crypto-s3';
import type { AppContext } from '../src/types/env';

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

describe('S3 Auth Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getMockEnv = async (credentialsInDb = true) => {
    const encryptedSecret = await encrypt(SECRET_ACCESS_KEY, TOKEN_ENCRYPTION_KEY);
    
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            return {
              first: vi.fn(async () => {
                if (sql.includes('SELECT * FROM s3_credentials WHERE access_key_id = ?')) {
                  if (credentialsInDb && args[0] === ACCESS_KEY_ID) {
                    return {
                      id: 'cred-123',
                      user_id: USER_ID,
                      access_key_id: ACCESS_KEY_ID,
                      secret_key_enc: encryptedSecret,
                      description: 'Test Credential'
                    };
                  }
                }
                return null;
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

  const createTestApp = () => {
    const testApp = new Hono<AppContext>();
    testApp.use('*', s3AuthMiddleware);
    testApp.all('*', (c) => {
      return c.json({ success: true, userId: c.get('userId') });
    });
    return testApp;
  };

  it('rejects requests with missing authentication credentials', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const res = await app.request('/test-bucket/file.txt', { method: 'GET' }, env);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>AccessDenied</Code>');
    expect(body).toContain('<Message>AWS Signature Version 4 credentials missing</Message>');
  });

  it('rejects requests with malformed Authorization header', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const res = await app.request('/test-bucket/file.txt', {
      method: 'GET',
      headers: {
        'Authorization': 'AWS4-HMAC-SHA256 MalformedHeaderData'
      }
    }, env);
    
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>InvalidAccessKeyId</Code>');
    expect(body).toContain('<Message>Malformed Authorization Header</Message>');
  });

  it('rejects requests if the Access Key does not exist', async () => {
    const app = createTestApp();
    const env = await getMockEnv(false); // No credentials in DB
    
    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    
    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers: {
        'host': 'localhost:8787',
        'x-amz-date': amzDate
      },
      dateStr,
      amzDate
    });

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        'host': 'localhost:8787',
        'x-amz-date': amzDate,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>InvalidAccessKeyId</Code>');
    expect(body).toContain('The AWS Access Key Id you provided does not exist');
  });

  it('accepts and authenticates valid Header-based requests', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
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
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.userId).toBe(USER_ID);
  });

  it('rejects Header-based requests with incorrect signatures', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate
    };

    const { signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    const incorrectSignature = 'a'.repeat(64);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${incorrectSignature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>SignatureDoesNotMatch</Code>');
  });

  it('accepts and authenticates valid Presigned URL query-based requests', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787'
    };
    
    // For query based auth, params to sign:
    const queryParams = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': '86400',
      'X-Amz-SignedHeaders': 'host'
    };

    const { signature } = calculateSigV4({
      method: 'GET',
      path,
      queryParams,
      headers,
      dateStr,
      amzDate
    });

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&') + `&X-Amz-Signature=${signature}`;

    const res = await app.request(`${path}?${queryString}`, {
      method: 'GET',
      headers
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.userId).toBe(USER_ID);
  });

  it('rejects expired Presigned URL requests', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    // Set timestamp to past
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const amzDate = pastDate.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
    const dateStr = amzDate.slice(0, 8);
    
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787'
    };
    
    const queryParams = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': '60', // Expires in 60 seconds (but it's 1 hour ago)
      'X-Amz-SignedHeaders': 'host'
    };

    const { signature } = calculateSigV4({
      method: 'GET',
      path,
      queryParams,
      headers,
      dateStr,
      amzDate
    });

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&') + `&X-Amz-Signature=${signature}`;

    const res = await app.request(`${path}?${queryString}`, {
      method: 'GET',
      headers
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>AccessDenied</Code>');
    expect(body).toContain('<Message>Request has expired</Message>');
  });

  it('rejects malformed date formats in presigned URLs', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const malformedAmzDate = '2026-06-21T12:00:00Z'; // standard ISO instead of YYYYMMDDTHHMMSSZ
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787'
    };
    
    const queryParams = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request`,
      'X-Amz-Date': malformedAmzDate,
      'X-Amz-Expires': '86400',
      'X-Amz-SignedHeaders': 'host'
    };

    const { signature } = calculateSigV4({
      method: 'GET',
      path,
      queryParams,
      headers,
      dateStr,
      amzDate: malformedAmzDate
    });

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&') + `&X-Amz-Signature=${signature}`;

    const res = await app.request(`${path}?${queryString}`, {
      method: 'GET',
      headers
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>AccessDenied</Code>');
    expect(body).toContain('<Message>Invalid date format (expected YYYYMMDDTHHMMSSZ)</Message>');
  });

  it('rejects header-based requests with skewed clocks (> 15 mins)', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    // 16 minutes in the past relative to 12:00:00Z (which is 11:44:00Z)
    const skewedAmzDate = '20260621T114400Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787',
      'x-amz-date': skewedAmzDate,
      'x-amz-content-sha256': sha256('')
    };

    const { signature, signedHeaders } = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate: skewedAmzDate
    });

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>RequestTimeTooSkewed</Code>');
    expect(body).toContain('The difference between the request time and the current time is too large.');
  });

  it('rejects presigned URLs with invalid signatures', async () => {
    const app = createTestApp();
    const env = await getMockEnv();
    
    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    const path = '/test-bucket/file.txt';
    const headers = {
      'host': 'localhost:8787'
    };
    
    const queryParams = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': '86400',
      'X-Amz-SignedHeaders': 'host'
    };

    const incorrectSignature = 'b'.repeat(64);

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&') + `&X-Amz-Signature=${incorrectSignature}`;

    const res = await app.request(`${path}?${queryString}`, {
      method: 'GET',
      headers
    }, env);

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('<Code>SignatureDoesNotMatch</Code>');
  });
});
