import { describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient, createAdminApi, queryString } from '../src/index';

const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-42' } });

describe('HttpClient', () => {
  it('解析统一响应，注入 Bearer token，API 封装编码筛选参数', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
      return reply(200, { success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    const api = createAdminApi(new HttpClient({ baseUrl: 'http://api.local/api/v1/', tokenProvider: () => 'token-1', fetcher: fetcher as typeof fetch }));
    await api.country.list({ keyword: '日 本', page: 1 });
    expect(fetcher.mock.calls[0]?.[0]).toContain('/admin/content/countries?keyword=%E6%97%A5+%E6%9C%AC&page=1');
    expect(queryString({ online: false, countryCode: undefined })).toBe('?online=false');
  });

  it('401 清理会话，403 保留会话和请求编号', async () => {
    const onUnauthorized = vi.fn();
    const client = new HttpClient({ baseUrl: 'http://api.local', onUnauthorized,
      fetcher: vi.fn().mockResolvedValueOnce(reply(401, { success: false, code: 'UNAUTHORIZED', message: '请登录' }))
        .mockResolvedValueOnce(reply(403, { success: false, code: 'FORBIDDEN', message: '无权限' })) as typeof fetch });
    await expect(client.request('/one')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED', requestId: 'request-42' });
    await expect(client.request('/two')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', requestId: 'request-42' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('旧账号请求晚到的 401 不会清理新账号会话', async () => {
    let token: string | null = 'old-token';
    let respond!: (response: Response) => void;
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const client = new HttpClient({ baseUrl: 'http://api.local', tokenProvider: () => token,
      onUnauthorized, fetcher: fetcher as typeof fetch });
    const pending = client.request('/trips');
    token = 'new-token';
    respond(reply(401, { success: false, code: 'UNAUTHORIZED', message: '请登录' }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('超时、网络故障和非 JSON 响应具有不同错误种类', async () => {
    const timeout = new HttpClient({ baseUrl: 'http://api.local', timeoutMs: 5,
      fetcher: ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch });
    await expect(timeout.request('/slow')).rejects.toMatchObject({ kind: 'TIMEOUT' });
    const network = new HttpClient({ baseUrl: 'http://api.local', fetcher: vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch });
    await expect(network.request('/offline')).rejects.toMatchObject({ kind: 'NETWORK' });
    const parse = new HttpClient({ baseUrl: 'http://api.local', fetcher: vi.fn().mockResolvedValue(new Response('<html>')) as typeof fetch });
    await expect(parse.request('/html')).rejects.toBeInstanceOf(ApiError);
    await expect(parse.request('/html')).rejects.toMatchObject({ kind: 'PARSE' });
  });

  it('使用平台 Adapter 时不依赖浏览器 AbortController', async () => {
    vi.stubGlobal('AbortController', undefined);
    try {
      const request = vi.fn().mockResolvedValue({ status: 200, data: { success: true, data: { ok: true } } });
      const client = new HttpClient({ baseUrl: 'http://api.local', adapter: { request } });
      await expect(client.request('/adapter')).resolves.toEqual({ ok: true });
      expect(request).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
