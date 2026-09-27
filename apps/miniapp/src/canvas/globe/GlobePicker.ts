import countryBorders from '../../assets/geo/country-borders.json';
import countryCodeMap from '../../assets/geo/country-alpha3.json';
import { GLOBE_RADIUS_SCALE, normalizeLongitude, type Rotation } from './globeProjection';

interface GeoRing { coordinates: Float32Array; count: number; minLongitude: number; maxLongitude: number;
  minLatitude: number; maxLatitude: number; centerLongitude: number }
interface CountryPolygon { code: string; rings: GeoRing[]; minLongitude: number; maxLongitude: number;
  minLatitude: number; maxLatitude: number }
interface RawCountry { code: string; rings: number[][][] }
export interface GlobeViewport { width: number; height: number; left: number; top: number }
export interface GeoLocation { longitude: number; latitude: number }

const GRID_STEP = 10;
const LONGITUDE_CELLS = 360 / GRID_STEP;
const LATITUDE_CELLS = 180 / GRID_STEP;
const GRID: number[][] = Array.from({ length: LONGITUDE_CELLS * LATITUDE_CELLS }, () => []);
const rawCountries = countryBorders as RawCountry[];

function prepareRing(points: number[][]): GeoRing {
  const coordinates = new Float32Array(points.length * 2);
  let minLongitude = Infinity; let maxLongitude = -Infinity;
  let minLatitude = Infinity; let maxLatitude = -Infinity;
  let previousLongitude = points[0]?.[0] ?? 0;
  for (let index = 0; index < points.length; index++) {
    const longitude = index === 0 ? previousLongitude
      : previousLongitude + normalizeLongitude((points[index]?.[0] ?? 0) - previousLongitude);
    const latitude = points[index]?.[1] ?? 0;
    coordinates[index * 2] = longitude;
    coordinates[index * 2 + 1] = latitude;
    previousLongitude = longitude;
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }
  return { coordinates, count: points.length, minLongitude, maxLongitude, minLatitude, maxLatitude,
    centerLongitude: (minLongitude + maxLongitude) * 0.5 };
}

function prepareCountry(country: RawCountry): CountryPolygon | null {
  const code = countryCodeMap[country.code as keyof typeof countryCodeMap];
  if (!code) return null;
  const rings = country.rings.map(prepareRing);
  return { code, rings, minLongitude: Math.min(...rings.map((ring) => ring.minLongitude)),
    maxLongitude: Math.max(...rings.map((ring) => ring.maxLongitude)),
    minLatitude: Math.min(...rings.map((ring) => ring.minLatitude)),
    maxLatitude: Math.max(...rings.map((ring) => ring.maxLatitude)) };
}

const countries = rawCountries.map(prepareCountry).filter((country): country is CountryPolygon => Boolean(country));

function bucketRange(min: number, max: number, lowerBound: number, cellCount: number): [number, number] {
  const first = Math.max(0, Math.min(cellCount - 1, Math.floor((min - lowerBound) / GRID_STEP)));
  const last = Math.max(0, Math.min(cellCount - 1, Math.floor((max - lowerBound) / GRID_STEP)));
  return [first, last];
}

for (let countryIndex = 0; countryIndex < countries.length; countryIndex++) {
  const country = countries[countryIndex]!;
  const [firstLatitude, lastLatitude] = bucketRange(country.minLatitude, country.maxLatitude, -90, LATITUDE_CELLS);
  const seen = new Set<number>();
  for (let x = 0; x < LONGITUDE_CELLS; x++) {
    const left = -180 + x * GRID_STEP;
    const right = left + GRID_STEP;
    const intersects = country.maxLongitude - country.minLongitude >= 360
      || [-720, -360, 0, 360, 720].some((offset) => right + offset >= country.minLongitude
        && left + offset <= country.maxLongitude);
    if (!intersects) continue;
    for (let y = firstLatitude; y <= lastLatitude; y++) {
      const bucket = y * LONGITUDE_CELLS + x;
      if (!seen.has(bucket)) { GRID[bucket]!.push(countryIndex); seen.add(bucket); }
    }
  }
}

export function screenToGlobeLocation(x: number, y: number, viewport: GlobeViewport, rotation: Rotation,
  zoom = 1): GeoLocation | null {
  const radius = Math.min(viewport.width, viewport.height) * 0.46 * GLOBE_RADIUS_SCALE * zoom;
  if (!radius) return null;
  const screenX = (x - viewport.left - viewport.width * 0.5) / radius;
  const screenY = -(y - viewport.top - viewport.height * 0.5) / radius;
  const distanceSquared = screenX * screenX + screenY * screenY;
  if (distanceSquared > 1) return null;

  const depth = Math.sqrt(1 - distanceSquared);
  const pitch = rotation.latitude * Math.PI / 180;
  const latitudeSine = screenY * Math.cos(pitch) + depth * Math.sin(pitch);
  const longitudeAxis = depth * Math.cos(pitch) - screenY * Math.sin(pitch);
  const relativeLongitude = Math.atan2(screenX, longitudeAxis) * 180 / Math.PI;
  return { longitude: normalizeLongitude(rotation.longitude + relativeLongitude),
    latitude: Math.asin(Math.max(-1, Math.min(1, latitudeSine))) * 180 / Math.PI };
}

function containsPoint(ring: GeoRing, longitude: number, latitude: number): boolean {
  if (latitude < ring.minLatitude || latitude > ring.maxLatitude) return false;
  const shiftedLongitude = longitude + 360 * Math.round((ring.centerLongitude - longitude) / 360);
  if (shiftedLongitude < ring.minLongitude || shiftedLongitude > ring.maxLongitude) return false;
  let inside = false;
  let previous = ring.count - 1;
  for (let current = 0; current < ring.count; current++) {
    const x1 = ring.coordinates[current * 2]!;
    const y1 = ring.coordinates[current * 2 + 1]!;
    const x2 = ring.coordinates[previous * 2]!;
    const y2 = ring.coordinates[previous * 2 + 1]!;
    if ((y1 > latitude) !== (y2 > latitude) && shiftedLongitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) {
      inside = !inside;
    }
    previous = current;
  }
  return inside;
}

export function pickCountry(latitude: number, longitude: number): string | null {
  const x = Math.max(0, Math.min(LONGITUDE_CELLS - 1, Math.floor((normalizeLongitude(longitude) + 180) / GRID_STEP)));
  const y = Math.max(0, Math.min(LATITUDE_CELLS - 1, Math.floor((latitude + 90) / GRID_STEP)));
  const candidates = GRID[y * LONGITUDE_CELLS + x]!;
  for (const index of candidates) {
    const country = countries[index]!;
    if (latitude < country.minLatitude || latitude > country.maxLatitude) continue;
    for (const ring of country.rings) {
      if (containsPoint(ring, longitude, latitude)) return country.code;
    }
  }
  return null;
}

export function pickCountryAt(x: number, y: number, viewport: GlobeViewport, rotation: Rotation,
  zoom = 1): string | null {
  const location = screenToGlobeLocation(x, y, viewport, rotation, zoom);
  return location ? pickCountry(location.latitude, location.longitude) : null;
}
