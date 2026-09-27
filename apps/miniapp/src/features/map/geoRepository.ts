import continents from '../../assets/geo/continent-centers.json';
import countries from '../../assets/geo/country-points.json';
export const geoRepository = { load: () => ({ continents, countries }) };
