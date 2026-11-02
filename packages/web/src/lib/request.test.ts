import { describe, it, expect, afterEach, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler, safeRedirectPath } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('API request handling', () => {
  it('treats 204 / empty responses as success without parsing JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.deleteFile('f1')).resolves.toBeUndefined();
  });

  it('reports a non-JSON success response clearly instead of "Unexpected token <"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
    const err = await api.getDrives().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/unexpected response/i);
  });

  it('turns a hung request into a timeout error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    const pending = api.getDrives().catch((e) => e);
    await vi.advanceTimersByTimeAsync(31_000);
    const err = await pending;
    vi.useRealTimers();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/too long/i);
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await api.getDrives().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/could not reach/i);
  });

  it('notifies the app when the session expires on an authenticated call', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Session expired' }, { status: 401 })));

    await expect(api.getDrives()).rejects.toThrow('Session expired');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed login or a locked share link as an expired session', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Invalid credentials' }, { status: 401 })));

    await expect(api.login({ username: 'a', password: 'b' })).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('safeRedirectPath', () => {
  it('only allows same-site paths', () => {
    expect(safeRedirectPath('/files/abc?driveId=1')).toBe('/files/abc?driveId=1');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('/\\evil.example')).toBe('/');
    expect(safeRedirectPath(null)).toBe('/');
  });
});
