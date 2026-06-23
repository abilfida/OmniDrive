import { describe, it, expect, vi } from 'vitest';
import { app } from '../src/index';

const mockSessionCookie = 'test-session-id';
const mockUserId = 'test-user-id';
const mockSessionData = {
  userId: mockUserId,
  username: 'testuser',
  role: 'member',
  createdAt: Date.now(),
};

describe('S3 Credentials API', () => {
  it('handles creation, listing and deletion', async () => {
    // 1. Setup mock KV and DB
    const kvStore: Record<string, string> = {
      [`session:${mockSessionCookie}`]: JSON.stringify(mockSessionData),
    };

    const mockKv = {
      get: vi.fn(async (key: string) => kvStore[key] || null),
      put: vi.fn(async (key: string, val: string) => {
        kvStore[key] = val;
      }),
      delete: vi.fn(async (key: string) => {
        delete kvStore[key];
      }),
    };

    let insertedData: any = null;
    let deletedId: string | null = null;

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            return {
              run: vi.fn(async () => {
                if (sql.includes('INSERT INTO s3_credentials')) {
                  insertedData = {
                    id: args[0],
                    userId: args[1],
                    accessKeyId: args[2],
                    secretKeyEnc: args[3],
                    description: args[4]
                  };
                } else if (sql.includes('DELETE FROM s3_credentials')) {
                  deletedId = args[0];
                }
                return { success: true };
              }),
              all: vi.fn(async () => {
                if (sql.includes('access_key_id')) {
                  return {
                    results: [
                      {
                        id: 'cred-123',
                        access_key_id: 'OMNI1234567890',
                        description: 'Test Credential',
                        created_at: new Date().toISOString()
                      }
                    ]
                  };
                }
                return { results: [] };
              })
            };
          })
        };
      })
    };

    const env = {
      FRONTEND_URL: 'http://localhost:3000',
      WORKER_URL: 'http://localhost:8787',
      DB: mockDb as any,
      KV: mockKv as any,
      JWT_SECRET: 'test-jwt-secret',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-which-is-long-enough',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret'
    };

    // 2. Test GET without auth (no cookies)
    const getNoAuth = await app.request('/api/s3-credentials', { method: 'GET' }, env);
    expect(getNoAuth.status).toBe(401);

    // 3. Test POST without auth
    const postNoAuth = await app.request('/api/s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ description: 'New Key' })
    }, env);
    expect(postNoAuth.status).toBe(401);

    // 4. Test POST with auth
    const postRes = await app.request('/api/s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `omnidrive_sid=${mockSessionCookie}`,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ description: 'My S3 Key' })
    }, env);

    expect(postRes.status).toBe(201);
    const postBody = await postRes.json() as any;
    expect(postBody.id).toBeDefined();
    expect(postBody.accessKeyId).toBeDefined();
    expect(postBody.secretAccessKey).toBeDefined();
    expect(postBody.description).toBe('My S3 Key');
    expect(postBody.createdAt).toBeDefined();

    // Verify DB insertion was triggered correctly
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO s3_credentials'));
    expect(insertedData).not.toBeNull();
    expect(insertedData.userId).toBe(mockUserId);
    expect(insertedData.description).toBe('My S3 Key');

    // 5. Test GET with auth
    const getRes = await app.request('/api/s3-credentials', {
      method: 'GET',
      headers: {
        'Cookie': `omnidrive_sid=${mockSessionCookie}`
      }
    }, env);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as any;
    expect(getBody).toBeInstanceOf(Array);
    expect(getBody[0].id).toBe('cred-123');

    // 6. Test DELETE with auth
    const deleteRes = await app.request('/api/s3-credentials/cred-123', {
      method: 'DELETE',
      headers: {
        'Cookie': `omnidrive_sid=${mockSessionCookie}`,
        'Origin': 'http://localhost:3000'
      }
    }, env);
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json() as any;
    expect(deleteBody.success).toBe(true);
    expect(deletedId).toBe('cred-123');
  });

  it('enforces manager/owner permissions when scoping key to a workspace', async () => {
    // Setup mock KV and DB
    const kvStore: Record<string, string> = {
      [`session:${mockSessionCookie}`]: JSON.stringify(mockSessionData),
    };

    const mockKv = {
      get: vi.fn(async (key: string) => kvStore[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };

    let userRoleInWorkspace: string | null = null;
    let insertedData: any = null;

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            return {
              first: vi.fn(async () => {
                if (sql.includes('SELECT role FROM workspace_members')) {
                  if (args[0] === 'workspace-123' && args[1] === mockUserId) {
                    return userRoleInWorkspace ? { role: userRoleInWorkspace } : null;
                  }
                }
                return null;
              }),
              run: vi.fn(async () => {
                if (sql.includes('INSERT INTO s3_credentials')) {
                  insertedData = {
                    id: args[0],
                    userId: args[1],
                    accessKeyId: args[2],
                    secretKeyEnc: args[3],
                    description: args[4],
                    workspaceId: args[5],
                  };
                }
                return { success: true };
              }),
              all: vi.fn(async () => {
                if (sql.includes('LEFT JOIN workspaces')) {
                  return {
                    results: [
                      {
                        id: 'cred-123',
                        access_key_id: 'OMNI1234567890',
                        description: 'Test Scoped Credential',
                        created_at: new Date().toISOString(),
                        workspace_id: 'workspace-123',
                        workspace_name: 'My Workspace'
                      }
                    ]
                  };
                }
                return { results: [] };
              })
            };
          })
        };
      })
    };

    const env = {
      FRONTEND_URL: 'http://localhost:3000',
      WORKER_URL: 'http://localhost:8787',
      DB: mockDb as any,
      KV: mockKv as any,
      JWT_SECRET: 'test-jwt-secret',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-which-is-long-enough',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret'
    };

    // 1. Test POST with viewer role (invalid permissions) -> 403 Forbidden
    userRoleInWorkspace = 'viewer';
    const viewerRes = await app.request('/api/s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `omnidrive_sid=${mockSessionCookie}`,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ description: 'Viewer Key', workspaceId: 'workspace-123' })
    }, env);
    expect(viewerRes.status).toBe(403);
    const viewerBody = await viewerRes.json() as any;
    expect(viewerBody.error).toBe('Unauthorized to manage S3 keys for this workspace');

    // 2. Test POST with manager role (valid permissions) -> 201 Created
    userRoleInWorkspace = 'manager';
    const managerRes = await app.request('/api/s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `omnidrive_sid=${mockSessionCookie}`,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ description: 'Manager Key', workspaceId: 'workspace-123' })
    }, env);
    expect(managerRes.status).toBe(201);
    const managerBody = await managerRes.json() as any;
    expect(managerBody.id).toBeDefined();
    expect(insertedData).not.toBeNull();
    expect(insertedData.workspaceId).toBe('workspace-123');

    // 3. Test GET for scoped credential (retrieves workspace_name and workspace_id)
    const getRes = await app.request('/api/s3-credentials', {
      method: 'GET',
      headers: {
        'Cookie': `omnidrive_sid=${mockSessionCookie}`
      }
    }, env);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as any;
    expect(getBody).toBeInstanceOf(Array);
    expect(getBody[0].id).toBe('cred-123');
    expect(getBody[0].workspace_id).toBe('workspace-123');
    expect(getBody[0].workspace_name).toBe('My Workspace');
  });
});
