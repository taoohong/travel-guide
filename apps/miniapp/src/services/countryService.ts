import { ContentModule } from '@travel-guide/constants';
import type { ContinentSummary, CountrySummary, Page } from '@travel-guide/api-client';
import { cacheKeys } from '../cache/cacheKeys';
import type { DataResult } from '../cache/cacheTypes';
import { serviceContext, type ServiceContext } from './context';

export function createCountryService(context: ServiceContext) {
  const { api, cache } = context;
  const pageSize = 100;
  const list = async (): Promise<Page<CountrySummary>> => {
    const firstPage = await api.countries({ page: 1, pageSize });
    const pageCount = Math.ceil(firstPage.total / firstPage.pageSize);
    if (pageCount <= 1) return firstPage;
    const remainingPages = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) =>
      api.countries({ page: index + 2, pageSize: firstPage.pageSize })));
    const items = [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
    return { ...firstPage, items, pageSize: items.length };
  };
  cache.register(ContentModule.COUNTRY, (key) => key === cacheKeys.continents ? api.continents :
    key === cacheKeys.countries ? list : key.startsWith('country:') ? () => api.country(key.slice(8)) : null);
  return {
    continents: async (onFresh?: (value: ContinentSummary[]) => void, onFailure?: () => void): Promise<DataResult<ContinentSummary[]>> =>
      cache.load(ContentModule.COUNTRY, cacheKeys.continents, api.continents, await context.version(ContentModule.COUNTRY), onFresh, onFailure),
    countries: async (onFresh?: (value: Page<CountrySummary>) => void, onFailure?: () => void): Promise<DataResult<Page<CountrySummary>>> =>
      cache.load(ContentModule.COUNTRY, cacheKeys.countries, list, await context.version(ContentModule.COUNTRY), onFresh, onFailure),
    country: async (code: string, onFresh?: (value: CountrySummary) => void): Promise<DataResult<CountrySummary>> =>
      cache.load(ContentModule.COUNTRY, cacheKeys.country(code), () => api.country(code), await context.version(ContentModule.COUNTRY), onFresh),
  };
}
export const countryService = createCountryService(serviceContext);
