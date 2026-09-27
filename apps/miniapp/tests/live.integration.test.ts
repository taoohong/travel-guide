import { describe, expect, it, vi } from 'vitest';
import { ContentModule } from '@travel-guide/constants';
import { createClientApi, HttpClient } from '@travel-guide/api-client';
import { cacheKeys } from '../src/cache/cacheKeys';
import { ContentCache } from '../src/cache/contentCache';
import { MemoryStorageAdapter } from '../src/cache/storage';
import { ContentVersionService } from '../src/services/contentVersionService';
import { createCountryService } from '../src/services/countryService';
import { PreferenceService } from '../src/services/preferenceService';
import { createVisaService } from '../src/services/visaService';
import type { ServiceContext } from '../src/services/context';

const live = process.env.TRAVEL_GUIDE_LIVE === '1';
describe.skipIf(!live)('小程序数据层真实 API 联调', () => {
  it('读取模块 A、缓存、签证地区隔离、单模块版本刷新和离线兜底', async () => {
    const baseUrl = process.env.TRAVEL_GUIDE_API_URL ?? 'http://127.0.0.1:3100/api/v1';
    const http = new HttpClient({ baseUrl, timeoutMs: 5_000 });
    const remote = createClientApi(http);
    const versions = await remote.contentVersion();
    const storage = new MemoryStorageAdapter();
    const cache = new ContentCache(storage, () => 100);
    const countryGet = vi.fn(remote.countries);
    const visaGet = vi.fn(remote.visa);
    const api = { ...remote, countries: countryGet, visa: visaGet };
    const context: ServiceContext = { api, cache, storage,
      version: async (module) => (await storage.get<typeof versions>(cacheKeys.versions))?.[module] };
    const countries = createCountryService(context);
    const visa = createVisaService(context);

    const continents = await countries.continents();
    const first = await countries.countries();
    expect(continents.data.some((item) => item.code === 'AS')).toBe(true);
    expect(first.data.items.some((item) => item.code === 'JP')).toBe(true);
    expect((await cache.read(cacheKeys.countries))?.data).toEqual(first.data);

    const cn = await visa.get('CN', 'JP');
    const sg = await visa.get('SG', 'JP');
    expect(cn.data.available).toBe(true);
    expect(sg.data.available).toBe(true);
    expect(cn.data.policy?.passportRegion).toBe('CN');
    expect(sg.data.policy?.passportRegion).toBe('SG');
    expect(await cache.read(cacheKeys.visa('CN', 'JP'))).not.toBeNull();
    expect(await cache.read(cacheKeys.visa('SG', 'JP'))).not.toBeNull();

    const preference = new PreferenceService(storage);
    expect((await preference.hydrate()).passportRegion).toBe('CN');
    expect((await preference.update({ passportRegion: 'SG' })).passportRegion).toBe('SG');
    expect((await visa.get('SG', 'JP')).data.policy?.passportRegion).toBe('SG');

    await storage.set(cacheKeys.versions, versions);
    const countryCalls = countryGet.mock.calls.length;
    const visaCalls = visaGet.mock.calls.length;
    const simulatedNext = { ...versions, [ContentModule.VISA]: versions.visa + 1 };
    const sync = new ContentVersionService({ contentVersion: async () => simulatedNext }, cache, storage);
    const result = await sync.sync();
    expect(result.changedModules).toEqual([ContentModule.VISA]);
    expect(result.failedModules).toEqual([]);
    expect(visaGet.mock.calls.length).toBeGreaterThan(visaCalls);
    expect(countryGet.mock.calls.length).toBe(countryCalls);
    expect((await storage.get<typeof versions>(cacheKeys.versions))?.visa).toBe(simulatedNext.visa);
    expect((await cache.read(cacheKeys.visa('CN', 'JP')))?.version).toBe(simulatedNext.visa);

    const second = await countries.countries();
    expect(second.meta.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
    const offlineApi = { ...api, countries: async () => { throw new Error('offline'); },
      country: async () => { throw new Error('offline'); } };
    const offlineCountries = createCountryService({ ...context, api: offlineApi });
    expect((await offlineCountries.countries()).meta.fromCache).toBe(true);
    await expect(offlineCountries.country('ZZ')).rejects.toThrow();
    const offlineVersion = await new ContentVersionService({ contentVersion: async () => { throw new Error('offline'); } },
      cache, storage).sync();
    expect(offlineVersion.offline).toBe(true);
    expect((await storage.get<typeof versions>(cacheKeys.versions))?.visa).toBe(simulatedNext.visa);
  }, 20_000);
});
