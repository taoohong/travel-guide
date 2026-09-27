import { ApiError, type ContinentSummary, type CountrySummary } from '@travel-guide/api-client';
import { geoRepository } from '../features/map/geoRepository';
import { countryService } from './countryService';

export const mapService = {
  geo: () => geoRepository.load(),
  async load(onContinents: (value: ContinentSummary[]) => void, onCountries: (value: CountrySummary[]) => void,
    onOffline: () => void) {
    const [continents, countries] = await Promise.allSettled([
      countryService.continents(onContinents, onOffline), countryService.countries((value) => onCountries(value.items), onOffline),
    ]);
    if (continents.status === 'rejected' && countries.status === 'rejected') {
      const reason: unknown = continents.reason;
      throw new Error(reason instanceof ApiError ? reason.message : '内容暂不可用，请检查网络后重试');
    }
    return { continents: continents.status === 'fulfilled' ? continents.value.data : [],
      countries: countries.status === 'fulfilled' ? countries.value.data.items : [],
      offline: continents.status === 'rejected' || countries.status === 'rejected',
      fromCache: (continents.status === 'fulfilled' && continents.value.meta.fromCache) ||
        (countries.status === 'fulfilled' && countries.value.meta.fromCache) };
  },
};
