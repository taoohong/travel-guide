import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '@travel-guide/api-client';
import { TaroHttpAdapter } from '../src/api/taroHttpAdapter';

describe('TaroHttpAdapter', () => {
  it('转发 method、headers、body、timeout 并解析统一响应', async () => {
    const request = vi.fn(async () => ({ statusCode: 200, data: JSON.stringify({ success: true, data: { ok: true } }),
      header: { 'x-request-id': 'taro-r1' } }));
    const client = new HttpClient({ baseUrl: 'https://api.test/api/v1', adapter: new TaroHttpAdapter({ request } as never),
      tokenProvider: () => 'mini-token', timeoutMs: 1234 });
    expect(await client.request('/probe', { method: 'POST', body: { x: 1 } })).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://api.test/api/v1/probe', method: 'POST',
      header: expect.objectContaining({ Authorization: 'Bearer mini-token', 'Content-Type': 'application/json' }),
      data: { x: 1 }, timeout: 1234 }));
  });
  it('假 JSON、超时和网络断开分别映射错误', async () => {
    const parse = new HttpClient({ baseUrl: 'x', adapter: new TaroHttpAdapter({ request: async () =>
      ({ statusCode: 200, data: '{', header: {} }) } as never) });
    await expect(parse.request('/x')).rejects.toMatchObject({ kind: 'PARSE' });
    const timeout = new HttpClient({ baseUrl: 'x', adapter: new TaroHttpAdapter({ request: async () => { throw new Error('request timeout'); } } as never) });
    await expect(timeout.request('/x')).rejects.toMatchObject({ kind: 'TIMEOUT' });
    const network = new HttpClient({ baseUrl: 'x', adapter: new TaroHttpAdapter({ request: async () => { throw new Error('offline'); } } as never) });
    await expect(network.request('/x')).rejects.toMatchObject({ kind: 'NETWORK' });
    const blocked = new HttpClient({ baseUrl: 'x', adapter: new TaroHttpAdapter({ request: async () => {
      throw { errMsg: 'request:fail url not in domain list' };
    } } as never) });
    await expect(blocked.request('/x')).rejects.toMatchObject({ code: 'DOMAIN_NOT_ALLOWED' });
  });
});
