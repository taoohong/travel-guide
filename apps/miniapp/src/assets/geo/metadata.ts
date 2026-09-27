/** Development geo metadata. Replace with reviewed geography before the 3D globe ships. */
export const geoMetadata = {
  continents: [
    { code: 'AS', center: [34, 105] }, { code: 'EU', center: [52, 13] }, { code: 'NA', center: [42, -100] },
  ],
  countries: [
    { code: 'JP', continentCode: 'AS', point: [36.2, 138.25] },
    { code: 'KR', continentCode: 'AS', point: [36.5, 127.8] },
    { code: 'FR', continentCode: 'EU', point: [46.6, 2.2] },
  ],
} as const;
