import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';
import { encrypt } from '../src/lib/crypto';
import { hmacSha256, sha256 } from '../src/lib/crypto-s3';
import { GoogleDriveService } from '../src/services/google-drive';

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
    files = [] as any[],
    userId = USER_ID,
    driveAccounts = [] as any[],
    fileResolved = null as any,
    folderResolved = null as any,
    sqlQueries = [] as { sql: string; args: any[] }[]
  } = {}) => {
    const encryptedSecret = await encrypt(SECRET_ACCESS_KEY, TOKEN_ENCRYPTION_KEY);

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            sqlQueries.push({ sql: sql.trim().replace(/\s+/g, ' '), args });
            return {
              run: vi.fn(async () => {
                return { success: true };
              }),
              first: vi.fn(async () => {
                if (sql.includes('SELECT * FROM s3_credentials WHERE access_key_id = ?')) {
                  if (args[0] === ACCESS_KEY_ID) {
                    return {
                      id: 'cred-123',
                      user_id: userId,
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
                if (sql.includes('SELECT id FROM workspace_folders')) {
                  return folderResolved;
                }
                if (sql.includes('FROM files')) {
                  return fileResolved;
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
                if (sql.includes('SELECT * FROM drive_accounts WHERE user_id = ?')) {
                  return { results: driveAccounts };
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
      KV: {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          accessToken: 'fake-access-token',
          refreshToken: 'fake-refresh-token',
          expiresAt: Date.now() + 3600_000,
        })),
        put: vi.fn().mockResolvedValue(undefined),
      } as any,
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

  it('escapes special XML characters in S3 ListBuckets, ListObjectsV2, and Errors responses', async () => {
    // 1. ListBuckets XML escaping check
    const workspaces = [
      { id: 'ws-1', name: 'my-<bucket>&"-1', created_at: '2026-06-21 10:00:00' }
    ];
    const weirdUserId = 'user-<id>&"\'';
    const envBuckets = await getMockEnv({ workspaces, userId: weirdUserId });

    const amzDate = '20260621T120000Z';
    const dateStr = '20260621';
    
    let path = '/s3/';
    let headers = {
      'host': 'localhost:8787',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256('')
    };

    let sigResult = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    let authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${sigResult.signedHeaders}, Signature=${sigResult.signature}`;

    let res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, envBuckets);

    expect(res.status).toBe(200);
    let body = await res.text();
    expect(body).toContain('<Name>my-&lt;bucket&gt;&amp;&quot;-1</Name>');
    expect(body).toContain(`<ID>user-&lt;id&gt;&amp;&quot;&apos;</ID>`);
    expect(body).toContain(`<DisplayName>user-&lt;id&gt;&amp;&quot;&apos;</DisplayName>`);

    // 2. ListObjectsV2 XML escaping check
    const workspaceResolved = { id: 'ws-1' };
    const files = [
      { id: 'f-<1>&"\'', name: 'photo-<1>&"\'.jpg', size: 1024, updated_at: '2026-06-21 11:30:00', s3_key: 'photo-<1>&"\'.jpg' }
    ];
    const envObjects = await getMockEnv({ workspaceResolved, files, userId: weirdUserId });
    
    path = '/s3/my-%3Cbucket%3E%26%22-1'; // url encoded my-<bucket>&"-1
    
    sigResult = calculateSigV4({
      method: 'GET',
      path,
      headers,
      dateStr,
      amzDate
    });

    authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${sigResult.signedHeaders}, Signature=${sigResult.signature}`;

    res = await app.request(path, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    }, envObjects);

    expect(res.status).toBe(200);
    body = await res.text();
    expect(body).toContain('<Name>my-&lt;bucket&gt;&amp;&quot;-1</Name>');
    expect(body).toContain('<Key>photo-&lt;1&gt;&amp;&quot;&apos;.jpg</Key>');
    expect(body).toContain('<ETag>"f-&lt;1&gt;&amp;&quot;&apos;"</ETag>');
  });

  it('defines handler routes for GET, PUT, DELETE, and HEAD objects', () => {
    // This verifies route patterns are matched inside Hono
    const routes = app.routes.filter(r => r.path.startsWith('/s3'));
    expect(routes.some(r => r.method === 'GET' && r.path === '/s3/:bucket/:key{.+}')).toBe(true);
    expect(routes.some(r => r.method === 'PUT' && r.path === '/s3/:bucket/:key{.+}')).toBe(true);
    expect(routes.some(r => r.method === 'DELETE' && r.path === '/s3/:bucket/:key{.+}')).toBe(true);
    expect(routes.some(r => r.method === 'HEAD' && r.path === '/s3/:bucket/:key{.+}')).toBe(true);
  });

  describe('S3 Object CRUD operations', () => {
    it('downloads an object (GetObject)', async () => {
      const workspaceResolved = { id: 'ws-1' };
      const fileResolved = {
        id: 'file-123',
        drive_account_id: 'drive-123',
        google_file_id: 'g-123',
        workspace_id: 'ws-1',
        workspace_folder_id: 'folder-123',
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        size: 12,
        is_trashed: 0
      };
      
      const sqlQueries: any[] = [];
      const env = await getMockEnv({
        workspaceResolved,
        fileResolved,
        folderResolved: { id: 'folder-123' },
        sqlQueries
      });

      const downloadSpy = vi.spyOn(GoogleDriveService.prototype, 'downloadFile').mockResolvedValue({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('file content'));
            controller.close();
          }
        })
      });

      const amzDate = '20260621T120000Z';
      const dateStr = '20260621';
      const path = '/s3/my-bucket-1/photos/holiday/photo.jpg';
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
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Content-Length')).toBe('12');
      const body = await res.text();
      expect(body).toBe('file content');
      expect(downloadSpy).toHaveBeenCalledWith('drive-123', 'g-123');
      downloadSpy.mockRestore();
    });

    it('retrieves metadata of an object (HeadObject)', async () => {
      const workspaceResolved = { id: 'ws-1' };
      const fileResolved = {
        id: 'file-123',
        drive_account_id: 'drive-123',
        google_file_id: 'g-123',
        workspace_id: 'ws-1',
        workspace_folder_id: 'folder-123',
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        size: 12,
        is_trashed: 0
      };

      const env = await getMockEnv({
        workspaceResolved,
        fileResolved,
        folderResolved: { id: 'folder-123' }
      });

      const amzDate = '20260621T120000Z';
      const dateStr = '20260621';
      const path = '/s3/my-bucket-1/photos/holiday/photo.jpg';
      const headers = {
        'host': 'localhost:8787',
        'x-amz-date': amzDate,
        'x-amz-content-sha256': sha256('')
      };

      const { signature, signedHeaders } = calculateSigV4({
        method: 'HEAD',
        path,
        headers,
        dateStr,
        amzDate
      });

      const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await app.request(path, {
        method: 'HEAD',
        headers: {
          ...headers,
          'Authorization': authHeader
        }
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Content-Length')).toBe('12');
      expect(res.headers.get('ETag')).toBe('"file-123"');
    });

    it('deletes an object (DeleteObject)', async () => {
      const workspaceResolved = { id: 'ws-1' };
      const fileResolved = {
        id: 'file-123',
        drive_account_id: 'drive-123',
        google_file_id: 'g-123',
        workspace_id: 'ws-1',
        workspace_folder_id: 'folder-123',
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        size: 12,
        is_trashed: 0
      };

      const sqlQueries: any[] = [];
      const env = await getMockEnv({
        workspaceResolved,
        fileResolved,
        folderResolved: { id: 'folder-123' },
        sqlQueries
      });

      const deleteSpy = vi.spyOn(GoogleDriveService.prototype, 'deleteFile').mockResolvedValue(undefined);

      const amzDate = '20260621T120000Z';
      const dateStr = '20260621';
      const path = '/s3/my-bucket-1/photos/holiday/photo.jpg';
      const headers = {
        'host': 'localhost:8787',
        'x-amz-date': amzDate,
        'x-amz-content-sha256': sha256('')
      };

      const { signature, signedHeaders } = calculateSigV4({
        method: 'DELETE',
        path,
        headers,
        dateStr,
        amzDate
      });

      const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await app.request(path, {
        method: 'DELETE',
        headers: {
          ...headers,
          'Authorization': authHeader
        }
      }, env);

      expect(res.status).toBe(204);
      expect(deleteSpy).toHaveBeenCalledWith('drive-123', 'g-123');
      
      const updateQuery = sqlQueries.find(q => q.sql.includes('UPDATE files SET is_trashed = 1'));
      expect(updateQuery).toBeDefined();
      expect(updateQuery.args[0]).toBe('file-123');

      deleteSpy.mockRestore();
    });

    it('uploads an object using single-part PUT (PutObject)', async () => {
      const workspaceResolved = { id: 'ws-1' };
      const driveAccounts = [
        {
          id: 'drive-123',
          user_id: USER_ID,
          google_account_id: 'google-acc-123',
          email: 'test@example.com',
          name: 'Drive Account',
          type: 'oauth',
          is_primary: 1,
          root_folder_id: 'root-folder-123',
          total_quota: 1000000,
          used_quota: 100,
          quota_updated_at: '2026-06-21 12:00:00',
          sync_status: 'idle',
          last_synced_at: '2026-06-21 12:00:00',
          created_at: '2026-06-21 12:00:00'
        }
      ];

      const sqlQueries: any[] = [];
      const env = await getMockEnv({
        workspaceResolved,
        driveAccounts,
        folderResolved: { id: 'folder-123' },
        sqlQueries
      });

      const initiateSpy = vi.spyOn(GoogleDriveService.prototype, 'initiateResumableUpload').mockResolvedValue('https://example.com/upload-url');

      const payload = 'hello world';
      const payloadMD5 = '5eb63bbbe01eeed093cb22bb8f5acdc3';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        if (url === 'https://example.com/upload-url') {
          if (init && init.body) {
            if (typeof init.body.getReader === 'function') {
              const reader = init.body.getReader();
              while (true) {
                const { done } = await reader.read();
                if (done) break;
              }
            } else if (typeof init.body[Symbol.asyncIterator] === 'function') {
              for await (const _ of init.body) {}
            }
          }
          return {
            ok: true,
            text: async () => JSON.stringify({ id: 'g-new-file-id' })
          } as Response;
        }
        return { ok: false } as Response;
      });

      const amzDate = '20260621T120000Z';
      const dateStr = '20260621';
      const path = '/s3/my-bucket-1/photos/holiday/photo.jpg';
      const headers = {
        'host': 'localhost:8787',
        'x-amz-date': amzDate,
        'x-amz-content-sha256': sha256(payload),
        'content-type': 'text/plain',
        'content-length': String(payload.length)
      };

      const { signature, signedHeaders } = calculateSigV4({
        method: 'PUT',
        path,
        headers,
        payload,
        dateStr,
        amzDate
      });

      const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await app.request(path, {
        method: 'PUT',
        headers: {
          ...headers,
          'Authorization': authHeader
        },
        body: payload
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(`"${payloadMD5}"`);

      expect(initiateSpy).toHaveBeenCalledWith('drive-123', 'photo.jpg', 'text/plain', 'root-folder-123');
      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/upload-url', expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Length': String(payload.length) })
      }));

      const insertQuery = sqlQueries.find(q => q.sql.includes('INSERT INTO files'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery.args[1]).toBe(USER_ID);
      expect(insertQuery.args[2]).toBe('drive-123');
      expect(insertQuery.args[3]).toBe('ws-1');
      expect(insertQuery.args[4]).toBe('folder-123');
      expect(insertQuery.args[5]).toBe('g-new-file-id');
      expect(insertQuery.args[6]).toBe('photo.jpg');
      expect(insertQuery.args[7]).toBe('text/plain');
      expect(insertQuery.args[8]).toBe(payload.length);

      initiateSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('uploads an object using single-part PUT and replaces duplicate file if exists', async () => {
      const workspaceResolved = { id: 'ws-1' };
      const driveAccounts = [
        {
          id: 'drive-123',
          user_id: USER_ID,
          google_account_id: 'google-acc-123',
          email: 'test@example.com',
          name: 'Drive Account',
          type: 'oauth',
          is_primary: 1,
          root_folder_id: 'root-folder-123',
          total_quota: 1000000,
          used_quota: 100,
          quota_updated_at: '2026-06-21 12:00:00',
          sync_status: 'idle',
          last_synced_at: '2026-06-21 12:00:00',
          created_at: '2026-06-21 12:00:00'
        }
      ];
      // Simulate an existing duplicate file in D1
      const fileResolved = {
        id: 'existing-file-123',
        drive_account_id: 'drive-123',
        google_file_id: 'g-existing-123',
        workspace_id: 'ws-1',
        workspace_folder_id: 'folder-123',
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        size: 12,
        is_trashed: 0
      };

      const sqlQueries: any[] = [];
      const env = await getMockEnv({
        workspaceResolved,
        driveAccounts,
        fileResolved,
        folderResolved: { id: 'folder-123' },
        sqlQueries
      });

      const initiateSpy = vi.spyOn(GoogleDriveService.prototype, 'initiateResumableUpload').mockResolvedValue('https://example.com/upload-url');
      const deleteSpy = vi.spyOn(GoogleDriveService.prototype, 'deleteFile').mockResolvedValue(undefined);

      const payload = 'hello world';
      const payloadMD5 = '5eb63bbbe01eeed093cb22bb8f5acdc3';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        if (url === 'https://example.com/upload-url') {
          if (init && init.body) {
            if (typeof init.body.getReader === 'function') {
              const reader = init.body.getReader();
              while (true) {
                const { done } = await reader.read();
                if (done) break;
              }
            } else if (typeof init.body[Symbol.asyncIterator] === 'function') {
              for await (const _ of init.body) {}
            }
          }
          return {
            ok: true,
            text: async () => JSON.stringify({ id: 'g-new-file-id' })
          } as Response;
        }
        return { ok: false } as Response;
      });

      const amzDate = '20260621T120000Z';
      const dateStr = '20260621';
      const path = '/s3/my-bucket-1/photos/holiday/photo.jpg';
      const headers = {
        'host': 'localhost:8787',
        'x-amz-date': amzDate,
        'x-amz-content-sha256': sha256(payload),
        'content-type': 'text/plain',
        'content-length': String(payload.length)
      };

      const { signature, signedHeaders } = calculateSigV4({
        method: 'PUT',
        path,
        headers,
        payload,
        dateStr,
        amzDate
      });

      const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${dateStr}/us-east-1/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await app.request(path, {
        method: 'PUT',
        headers: {
          ...headers,
          'Authorization': authHeader
        },
        body: payload
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(`"${payloadMD5}"`);

      // Verify Google Drive API call to delete the duplicate file was made
      expect(deleteSpy).toHaveBeenCalledWith('drive-123', 'g-existing-123');

      // Verify D1 query to delete the duplicate file row was executed
      const deleteQuery = sqlQueries.find(q => q.sql.includes('DELETE FROM files'));
      expect(deleteQuery).toBeDefined();
      expect(deleteQuery.args[0]).toBe('existing-file-123');

      const insertQuery = sqlQueries.find(q => q.sql.includes('INSERT INTO files'));
      expect(insertQuery).toBeDefined();
      // Check metadata containing md5 is inserted
      expect(insertQuery.args[9]).toBe(JSON.stringify({ md5: payloadMD5 }));

      initiateSpy.mockRestore();
      deleteSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });
});
