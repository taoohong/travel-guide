import { describe, expect, it, vi } from 'vitest';
import { ContentModule, VisaRequirementType, VisaType } from '@travel-guide/constants';
import type { CountryGuideResponse } from '@travel-guide/api-client';
import type { VisaPolicy } from '@travel-guide/types';
import { ContentCache } from '../src/cache/contentCache';
import { cacheKeys } from '../src/cache/cacheKeys';
import { MemoryStorageAdapter } from '../src/cache/storage';
import { createVisaService } from '../src/services/visaService';
import { createCountryGuideService } from '../src/services/countryGuideService';
import type { ServiceContext } from '../src/services/context';
import { passportRequirementLabel, visaRequirementLabel, visaStayLabel } from '../src/features/destination/visaPresentation';

const policy: VisaPolicy = {
  passportRegion: 'CN', destinationCountryCode: 'IE', visaType: VisaType.VISA_REQUIRED,
  visaRequirement: VisaRequirementType.REQUIRED, title: '中国大陆护照赴爱尔兰', corePolicy: [], maxStayDays: null,
  passportRequired: null, passportValidityMonths: null, passportValidityRequirement: null, entrySummary: null,
  requirementText: null, sourceProvider: null, retrievedAt: null, fee: null, processingTime: null,
  requirements: [], notes: [], sourceName: '中国领事服务网', sourceUrl: null,
  version: 1, status: 'PUBLISHED', effectiveFrom: null, effectiveTo: null, lastVerifiedAt: null,
};

describe('国家详情签证摘要与缓存', () => {
  it('CN → IE REQUIRED 且 null 停留天数、护照要求不伪造期限', () => {
    expect(visaRequirementLabel(policy)).toBe('需要提前办理');
    expect(visaStayLabel(policy.maxStayDays)).toBe('未明确');
    expect(passportRequirementLabel(policy)).toBe('请查看详细规定');
  });

  it('护照地区切换使用独立 visa 缓存并重新请求', async () => {
    const storage = new MemoryStorageAdapter(); const cache = new ContentCache(storage);
    const request = vi.fn(async (passportRegion: string) => ({ policy: { ...policy, passportRegion }, available: true,
      matchLevel: 'exact' as const, expired: false, daysSinceVerified: null, freshnessMessage: '', advice: { level: '', text: '' },
      visaRequirement: VisaRequirementType.REQUIRED, maxStayDays: null, passportRequired: null, passportValidityMonths: null,
      entrySummary: null, requirementText: null, sourceUrl: null, lastVerifiedAt: null }));
    const context = { cache, storage, version: async () => 1, api: { visa: request } } as unknown as ServiceContext;
    const service = createVisaService(context);
    await service.get('CN', 'IE'); await service.get('SG', 'IE');
    expect(request.mock.calls).toEqual([['CN', 'IE'], ['SG', 'IE']]);
    expect(cacheKeys.visa('CN', 'IE')).toBe('visa:CN:IE');
    expect(cacheKeys.visa('SG', 'IE')).toBe('visa:SG:IE');
    expect(cacheKeys.countryGuide('IE')).toBe('guide:IE');
    expect(ContentModule.COUNTRY_GUIDE).not.toBe(ContentModule.ATTRACTION);
  });

  it('把 Country Guide 分组映射为七个用户端栏目，并保留源信息', async () => {
    const response: CountryGuideResponse = {
      country: { code: 'IE', continentCode: 'EU', name: '爱尔兰', nameEn: 'Ireland', latitude: 0, longitude: 0,
        online: true, completeness: 0, version: 1 },
      sections: { overview: [{ id: 'overview', title: '国家概况', subtitle: null, content: '概况内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        entryResidence: [{ id: 'entry', title: '签证入境', subtitle: null, content: '入境内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        travelRisk: [{ id: 'risk', title: '风险等级', subtitle: null, content: '风险内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        safety: [{ id: 'safety', title: '社会治安', subtitle: null, content: '治安内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        transport: [{ id: 'transport', title: '空中交通', subtitle: null, content: '交通内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        priceMedical: [{ id: 'life', title: '保险医疗', subtitle: null, content: '生活内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }],
        practicalInfo: [{ id: 'practical', title: '通信电源', subtitle: null, content: '实用内容', sortOrder: 0, sourceUrl: null, lastVerifiedAt: null }] },
      source: { provider: '中国领事服务网', sourceUrl: 'https://cs.mfa.gov.cn/', lastVerifiedAt: '2026-09-20T00:00:00.000Z' },
    };
    const cache = new ContentCache(new MemoryStorageAdapter());
    const context = { cache, storage: new MemoryStorageAdapter(), version: async () => 4, api: { countryGuide: vi.fn(async () => response) } } as unknown as ServiceContext;
    const result = await createCountryGuideService(context).get('IE');
    expect(result.data.map(({ sectionKey }) => sectionKey)).toEqual([
      'COUNTRY_OVERVIEW', 'ENTRY_RESIDENCE', 'TRAVEL_RISK', 'SAFETY', 'TRANSPORT', 'PRICE_MEDICAL', 'PRACTICAL_INFO',
    ]);
    expect(result.data[0]).toMatchObject({ sourceProvider: '中国领事服务网', lastVerifiedAt: '2026-09-20T00:00:00.000Z' });
  });
});
