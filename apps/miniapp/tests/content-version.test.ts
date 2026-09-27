import { describe, expect, it } from 'vitest';
import { ContentModule } from '@travel-guide/constants';
import type { ContentVersionSnapshot } from '@travel-guide/types';
import { cacheKeys } from '../src/cache/cacheKeys';
import { ContentCache } from '../src/cache/contentCache';
import { MemoryStorageAdapter } from '../src/cache/storage';
import { ContentVersionService } from '../src/services/contentVersionService';

const snapshot = (visa: number, country = 0): ContentVersionSnapshot =>
  ({ country, visa, attraction: 0, transport: 0, packing: 0, travelTip: 0, city: 0 });

describe('逐模块 ContentVersion', () => {
  it('只刷新变化的 visa，缓存写入成功后才提交版本', async () => {
    const events: string[] = [];
    class TrackedStorage extends MemoryStorageAdapter {
      override async set<T>(key: string, value: T): Promise<void> { events.push(key); await super.set(key, value); }
    }
    const storage = new TrackedStorage();
    const cache = new ContentCache(storage, () => 100);
    await cache.write(ContentModule.VISA, cacheKeys.visa('CN', 'JP'), { title: '旧政策' }, 1);
    await storage.set(cacheKeys.versions, { visa: 1 });
    cache.register(ContentModule.VISA, () => async () => ({ title: '新政策' }));
    events.length = 0;
    const result = await new ContentVersionService({ contentVersion: async () => snapshot(2) }, cache, storage).sync();
    expect(result.changedModules).toEqual(['visa']);
    expect(result.failedModules).toEqual([]);
    expect((await cache.read<{ title: string }>(cacheKeys.visa('CN', 'JP')))?.data.title).toBe('新政策');
    expect((await storage.get<ContentVersionSnapshot>(cacheKeys.versions))?.visa).toBe(2);
    expect(events.indexOf(cacheKeys.visa('CN', 'JP'))).toBeLessThan(events.lastIndexOf(cacheKeys.versions));
  });
  it('拉取失败不得提前更新版本，旧缓存继续可用', async () => {
    const storage = new MemoryStorageAdapter(); const cache = new ContentCache(storage);
    await cache.write(ContentModule.VISA, cacheKeys.visa('CN', 'JP'), { title: '旧政策' }, 1);
    await storage.set(cacheKeys.versions, { visa: 1 });
    cache.register(ContentModule.VISA, () => async () => { throw new Error('offline'); });
    const result = await new ContentVersionService({ contentVersion: async () => snapshot(2) }, cache, storage).sync();
    expect(result.failedModules).toEqual(['visa']);
    expect((await storage.get<ContentVersionSnapshot>(cacheKeys.versions))?.visa).toBe(1);
    expect((await cache.read<{ title: string }>(cacheKeys.visa('CN', 'JP')))?.data.title).toBe('旧政策');
  });
  it('无变化不请求内容；多个模块各自独立提交；版本请求失败保留本地状态', async () => {
    const storage = new MemoryStorageAdapter(); const cache = new ContentCache(storage);
    await storage.set(cacheKeys.versions, { visa: 1, country: 1 });
    const same = await new ContentVersionService({ contentVersion: async () => snapshot(1, 1) }, cache, storage).sync();
    expect(same.changedModules).toEqual([]);
    const changed = await new ContentVersionService({ contentVersion: async () => snapshot(2, 3) }, cache, storage).sync();
    expect(changed.changedModules).toEqual(['country', 'visa']);
    expect((await storage.get<ContentVersionSnapshot>(cacheKeys.versions))?.country).toBe(3);
    const offline = await new ContentVersionService({ contentVersion: async () => { throw new Error('offline'); } }, cache, storage).sync();
    expect(offline.offline).toBe(true);
    expect(offline.local).toMatchObject({ country: 3, visa: 2 });
  });
});
