import type { ContentModule } from '@travel-guide/constants';
import type { DataResult } from '../cache/cacheTypes';
import { serviceContext, type ServiceContext } from './context';

export function createGuideService<T>(module: ContentModule, prefix: string,
  fetch: (context: ServiceContext, country: string) => Promise<T>, context: ServiceContext = serviceContext) {
  const { cache } = context;
  cache.register(module, (key) => key.startsWith(`${prefix}:`) ? () => fetch(context, key.slice(prefix.length + 1)) : null);
  return { get: async (country: string, onFresh?: (value: T) => void): Promise<DataResult<T>> =>
    cache.load(module, `${prefix}:${country}`, () => fetch(context, country), await context.version(module), onFresh) };
}
