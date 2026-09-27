import { ContentModule } from '@travel-guide/constants';
import type { CountryGuideSection } from '@travel-guide/api-client';
import { createGuideService } from './guideService';
import { serviceContext, type ServiceContext } from './context';

const categories = [
  ['overview', 'COUNTRY_OVERVIEW'], ['entryResidence', 'ENTRY_RESIDENCE'], ['travelRisk', 'TRAVEL_RISK'],
  ['safety', 'SAFETY'], ['transport', 'TRANSPORT'], ['priceMedical', 'PRICE_MEDICAL'], ['practicalInfo', 'PRACTICAL_INFO'],
] as const;

export function createCountryGuideService(context: ServiceContext = serviceContext) {
  return createGuideService(ContentModule.COUNTRY_GUIDE, 'guide', async (context, countryCode) => {
  const result = await context.api.countryGuide(countryCode);
  return categories.flatMap(([group, sectionKey]) => result.sections[group].map((section): CountryGuideSection => ({
    ...section, sourceUrl: section.sourceUrl || result.source.sourceUrl, countryCode: result.country.code, sectionKey, sourceProvider: result.source.provider,
    sourceUpdatedAt: null, importedAt: null, lastVerifiedAt: section.lastVerifiedAt || result.source.lastVerifiedAt,
  })));
  }, context);
}

export const countryGuideService = createCountryGuideService();
