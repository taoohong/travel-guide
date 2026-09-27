export interface Rotation { longitude: number; latitude: number }
export interface GeoPoint { latitude: number; longitude: number }
export interface ProjectedPoint { x: number; y: number; depth: number; visible: boolean }

const radians = (degrees: number) => degrees * Math.PI / 180;
export const GLOBE_RADIUS_SCALE = 0.85;
export const normalizeLongitude = (value: number) => ((value + 540) % 360) - 180;

export function projectPoint(point: GeoPoint, rotation: Rotation, radius = 1): ProjectedPoint {
  const lat = radians(point.latitude); const relativeLon = radians(normalizeLongitude(point.longitude - rotation.longitude));
  const pitch = radians(rotation.latitude); const cosLat = Math.cos(lat); const cosLon = Math.cos(relativeLon);
  const x = cosLat * Math.sin(relativeLon);
  const y = Math.sin(lat) * Math.cos(pitch) - cosLat * cosLon * Math.sin(pitch);
  const depth = Math.sin(lat) * Math.sin(pitch) + cosLat * cosLon * Math.cos(pitch);
  const screenX = x * radius; const screenY = -y * radius;
  return { x: Math.abs(screenX) < 1e-12 ? 0 : screenX, y: Math.abs(screenY) < 1e-12 ? 0 : screenY,
    depth, visible: depth >= 0 };
}

export function angularDistance(a: GeoPoint, b: GeoPoint): number {
  const lat1 = radians(a.latitude); const lat2 = radians(b.latitude);
  const deltaLon = radians(normalizeLongitude(a.longitude - b.longitude));
  return Math.acos(Math.min(1, Math.max(-1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLon))));
}

export function nearestGeo<T extends GeoPoint>(center: GeoPoint, values: readonly T[]): T | null {
  return values.reduce<T | null>((nearest, value) => !nearest || angularDistance(center, value) < angularDistance(center, nearest) ? value : nearest, null);
}
