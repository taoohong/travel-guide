import type { VisaLookup } from '@travel-guide/api-client';
import { ContentModule } from '@travel-guide/constants';
import { cacheKeys } from '../cache/cacheKeys';
import type { DataResult } from '../cache/cacheTypes';
import { serviceContext, type ServiceContext } from './context';

export function createVisaService(context: ServiceContext) {
  const { api, cache } = context;
  cache.register(ContentModule.VISA, (key) => {
    const [, passport, country] = key.split(':');
    return key.startsWith('visa:') && passport && country ? () => api.visa(passport, country) : null;
  });
  return { get: async (passport: string, country: string, onFresh?: (value: VisaLookup) => void): Promise<DataResult<VisaLookup>> =>
    cache.load(ContentModule.VISA, cacheKeys.visa(passport, country), () => api.visa(passport, country),
      await context.version(ContentModule.VISA), onFresh) };
}
export const visaService = createVisaService(serviceContext);
