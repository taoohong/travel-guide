import { describe, expect, it, vi } from 'vitest';
import type { ClientApi, CountrySummary, Page, VisaLookup } from '@travel-guide/api-client';
import { cacheKeys } from '../src/cache/cacheKeys';
import { ContentCache } from '../src/cache/contentCache';
import { MemoryStorageAdapter } from '../src/cache/storage';
import { createCountryService } from '../src/services/countryService';
import { createVisaService } from '../src/services/visaService';
import type { ServiceContext } from '../src/services/context';

const japan: CountrySummary = { code: 'JP', continentCode: 'AS', name: '日本', nameEn: 'Japan', latitude: 36,
  longitude: 138, online: true, completeness: 80, version: 1 };
const korea: CountrySummary = { code: 'KR', continentCode: 'AS', name: '韩国', nameEn: 'South Korea', latitude: 36,
  longitude: 128, online: true, completeness: 80, version: 1 };
const page: Page<CountrySummary> = { items: [japan], total: 1, page: 1, pageSize: 100 };
function context(api: Partial<ClientApi>, storage = new MemoryStorageAdapter()): ServiceContext {
  return { api: api as ClientApi, cache: new ContentCache(storage, () => 100), storage, version: async () => 1 };
}

describe('内容 Service', () => {
  it('无缓存请求 API，随后命中缓存立即展示，离线时保留旧内容', async () => {
    const countries = vi.fn().mockResolvedValueOnce(page).mockRejectedValue(new Error('offline'));
    const service = createCountryService(context({ countries }));
    expect((await service.countries()).meta.fromCache).toBe(false);
    const second = await service.countries();
    expect(second).toMatchObject({ data: page, meta: { fromCache: true } });
    await expect(service.country('KR')).rejects.toThrow();
  });
  it('国家目录跨页加载完整名称，避免地图地点退回显示国家代码', async () => {
    const countries = vi.fn().mockResolvedValueOnce({ items: [japan], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ items: [korea], total: 2, page: 2, pageSize: 1 });
    const service = createCountryService(context({ countries }));
    const result = await service.countries();
    expect(result.data.items.map(({ code, name }) => [code, name])).toEqual([['JP', '日本'], ['KR', '韩国']]);
    expect(countries).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(countries).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 1 });
  });
  it('CN/JP 与 SG/JP 使用不同缓存，护照切换不会复用旧政策', async () => {
    const visa = vi.fn(async (passport: string) => ({ available: true, policy: { passportRegion: passport } } as VisaLookup));
    const ctx = context({ visa }); const service = createVisaService(ctx);
    const cn = await service.get('CN', 'JP'); const sg = await service.get('SG', 'JP');
    expect(cn.data.policy?.passportRegion).toBe('CN');
    expect(sg.data.policy?.passportRegion).toBe('SG');
    expect(cacheKeys.visa('CN', 'JP')).not.toBe(cacheKeys.visa('SG', 'JP'));
    expect((await ctx.cache.read(cacheKeys.visa('CN', 'JP')))?.data).toEqual(cn.data);
    expect(visa).toHaveBeenCalledTimes(2);
  });
});
