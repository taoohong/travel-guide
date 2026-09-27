export const cacheKeys = {
  preferences: 'preferences', versions: 'content:versions', continents: 'continents:all', countries: 'countries:all',
  country: (code: string) => `country:${code}`, visa: (passport: string, country: string) => `visa:${passport}:${country}`,
  countryGuide: (code: string) => `guide:${code}`,
  attractions: (code: string) => `attraction:${code}`, transport: (code: string) => `transport:${code}`,
  packing: (code: string) => `packing:${code}`, travelTips: (code: string) => `travelTip:${code}`,
  index: (module: string) => `cache:index:${module}`,
} as const;
