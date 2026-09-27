import { describe, expect, it, vi } from 'vitest';
import { ContentModule } from '@travel-guide/constants';
import { cacheKeys } from '../src/cache/cacheKeys';
import { ContentCache } from '../src/cache/contentCache';
import { MemoryStorageAdapter, TaroStorageAdapter } from '../src/cache/storage';

describe('缓存与 StorageAdapter', () => {
  it('写入、读取、缺失、删除与注入时钟', async () => {
    const storage = new MemoryStorageAdapter();
    const cache = new ContentCache(storage, () => 1234);
    expect(await cache.read('country:JP')).toBeNull();
    await cache.write(ContentModule.COUNTRY, cacheKeys.country('JP'), { code: 'JP' }, 2);
    expect(await cache.read(cacheKeys.country('JP'))).toEqual({ data: { code: 'JP' }, version: 2, cachedAt: 1234 });
    expect(await storage.get(cacheKeys.index(ContentModule.COUNTRY))).toEqual(['country:JP']);
    await storage.remove(cacheKeys.country('JP'));
    expect(await cache.read(cacheKeys.country('JP'))).toBeNull();
  });
  it('缓存命中立即返回旧数据，网络失败仍保留旧数据', async () => {
    const cache = new ContentCache(new MemoryStorageAdapter(), () => 20);
    await cache.write(ContentModule.COUNTRY, 'country:JP', { name: '日本' }, 1);
    const result = await cache.load(ContentModule.COUNTRY, 'country:JP', async () => { throw new Error('offline'); }, 2);
    expect(result).toEqual({ data: { name: '日本' }, meta: { fromCache: true, stale: true } });
    expect((await cache.read<{ name: string }>('country:JP'))?.data.name).toBe('日本');
  });
  it('并发相同 GET 只拉取一次，索引并发写不丢失', async () => {
    const cache = new ContentCache(new MemoryStorageAdapter());
    const fetcher = vi.fn(async () => ['JP']);
    const [a, b] = await Promise.all([
      cache.load(ContentModule.COUNTRY, 'country:JP', fetcher),
      cache.load(ContentModule.COUNTRY, 'country:JP', fetcher),
    ]);
    expect(a.data).toEqual(['JP']); expect(b.data).toEqual(['JP']); expect(fetcher).toHaveBeenCalledTimes(1);
    await Promise.all([cache.write(ContentModule.COUNTRY, 'country:KR', 'KR'),
      cache.write(ContentModule.COUNTRY, 'country:FR', 'FR')]);
    expect(await cache.storage.get(cacheKeys.index(ContentModule.COUNTRY))).toEqual(['country:JP', 'country:KR', 'country:FR']);
  });
  it('Taro Storage 适配器处理损坏 JSON、缺失与写入失败', async () => {
    const values = new Map<string, string>();
    const taro = { getStorage: vi.fn(async ({ key }: { key: string }) => {
      if (!values.has(key)) throw new Error('not found');
      return { data: values.get(key) };
    }), setStorage: vi.fn(async ({ key, data }: { key: string; data: string }) => { values.set(key, data); }),
    removeStorage: vi.fn(async ({ key }: { key: string }) => { values.delete(key); }) };
    const storage = new TaroStorageAdapter(taro as never);
    expect(await storage.get('missing')).toBeNull();
    values.set('bad', '{'); expect(await storage.get('bad')).toBeNull();
    await storage.set('good', { n: 1 }); expect(await storage.get('good')).toEqual({ n: 1 });
    await storage.remove('good'); expect(await storage.get('good')).toBeNull();
    const broken = new TaroStorageAdapter({ ...taro, setStorage: vi.fn(async () => { throw new Error('disk full'); }) } as never);
    await expect(broken.set('x', 1)).rejects.toThrow('disk full');
  });
});
