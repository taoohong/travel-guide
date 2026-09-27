import lowLand from '../../assets/geo/land-low.json';
import highLand from '../../assets/geo/land-high.json';
import lowBorders from '../../assets/geo/country-borders-low.json';
import mediumBorders from '../../assets/geo/country-borders-medium.json';
import highBorders from '../../assets/geo/country-borders.json';
import countryPoints from '../../assets/geo/country-points.json';
import { GLOBE_RADIUS_SCALE, normalizeLongitude, type Rotation } from './globeProjection';
import type { QualityLevel } from './globeState';

export interface GlobeRenderOptions { width: number; height: number; rotation: Rotation; activeContinent: string; quality: QualityLevel;
  selectedCountryCodes?: readonly string[]; focusedCountryCode?: string | null; zoom?: number }
interface RawRingFeature { points?: number[][]; rings?: number[][][]; code: string; continentCode?: string }
interface RawCountryPoint { code: string; continentCode: string; latitude: number; longitude: number }
interface PreparedRing { longitude: Float32Array; latitude: Float32Array; sinLongitude: Float32Array;
  cosLongitude: Float32Array; sinLatitude: Float32Array; cosLatitude: Float32Array; count: number }
interface PreparedShape { code: string; rings: PreparedRing[] }
interface Transform { cosYaw: number; sinYaw: number; cosPitch: number; sinPitch: number; radius: number }

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const PI = Math.PI;
const PROJECTED = new Float64Array(3);
const EDGE = new Float64Array(3);
const TRANSFORM: Transform = { cosYaw: 1, sinYaw: 0, cosPitch: 1, sinPitch: 0, radius: 1 };
const GRADIENTS = new WeakMap<CanvasRenderingContext2D, { width: number; height: number; radius: number;
  ocean: CanvasGradient; aura: CanvasGradient }>();

function prepareRing(points: number[][]): PreparedRing {
  const count = points.length;
  const longitude = new Float32Array(count); const latitude = new Float32Array(count);
  const sinLongitude = new Float32Array(count); const cosLongitude = new Float32Array(count);
  const sinLatitude = new Float32Array(count); const cosLatitude = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const lon = (points[index]?.[0] ?? 0) * RAD;
    const lat = (points[index]?.[1] ?? 0) * RAD;
    longitude[index] = lon; latitude[index] = lat;
    sinLongitude[index] = Math.sin(lon); cosLongitude[index] = Math.cos(lon);
    sinLatitude[index] = Math.sin(lat); cosLatitude[index] = Math.cos(lat);
  }
  return { longitude, latitude, sinLongitude, cosLongitude, sinLatitude, cosLatitude, count };
}

function prepareShapes(features: RawRingFeature[]): PreparedShape[] {
  return features.map((feature) => ({ code: feature.code,
    rings: (feature.rings ?? (feature.points ? [feature.points] : [])).map(prepareRing) }));
}

const LAND: Record<'low' | 'high', PreparedShape[]> = {
  low: prepareShapes(lowLand as RawRingFeature[]), high: prepareShapes(highLand as RawRingFeature[]),
};
const BORDERS: Record<QualityLevel, PreparedShape[]> = {
  low: prepareShapes(lowBorders as RawRingFeature[]), medium: prepareShapes(mediumBorders as RawRingFeature[]),
  high: prepareShapes(highBorders as RawRingFeature[]),
};
const POINTS = (countryPoints as RawCountryPoint[]).map((point) => ({ ...point,
  sinLongitude: Math.sin(point.longitude * RAD), cosLongitude: Math.cos(point.longitude * RAD),
  sinLatitude: Math.sin(point.latitude * RAD), cosLatitude: Math.cos(point.latitude * RAD) }));

function project(ring: PreparedRing, index: number, transform: Transform, output: Float64Array): void {
  const sinLongitude = ring.sinLongitude[index]!; const cosLongitude = ring.cosLongitude[index]!;
  const x = ring.cosLatitude[index]! * (sinLongitude * transform.cosYaw - cosLongitude * transform.sinYaw);
  const z = ring.cosLatitude[index]! * (sinLongitude * transform.sinYaw + cosLongitude * transform.cosYaw);
  const sinLatitude = ring.sinLatitude[index]!;
  output[0] = x * transform.radius;
  output[1] = -(sinLatitude * transform.cosPitch - z * transform.sinPitch) * transform.radius;
  output[2] = sinLatitude * transform.sinPitch + z * transform.cosPitch;
}

function projectRaw(longitude: number, latitude: number, transform: Transform, output: Float64Array): void {
  const lon = longitude * RAD; const lat = latitude * RAD;
  const sinLon = Math.sin(lon); const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat); const cosLat = Math.cos(lat);
  const x = cosLat * (sinLon * transform.cosYaw - cosLon * transform.sinYaw);
  const z = cosLat * (sinLon * transform.sinYaw + cosLon * transform.cosYaw);
  output[0] = x * transform.radius;
  output[1] = -(sinLat * transform.cosPitch - z * transform.sinPitch) * transform.radius;
  output[2] = sinLat * transform.sinPitch + z * transform.cosPitch;
}

function projectHorizon(ring: PreparedRing, first: number, second: number, transform: Transform, output: Float64Array): void {
  const firstLongitude = ring.longitude[first]!; const firstLatitude = ring.latitude[first]!;
  const deltaLongitude = normalizeLongitude((ring.longitude[second]! - firstLongitude) / RAD) * RAD;
  const deltaLatitude = ring.latitude[second]! - firstLatitude;
  projectRaw(firstLongitude / RAD, firstLatitude / RAD, transform, output);
  const firstVisible = output[2]! >= 0;
  let low = 0; let high = 1;
  for (let step = 0; step < 11; step++) {
    const middle = (low + high) * 0.5;
    projectRaw(firstLongitude / RAD + deltaLongitude / RAD * middle,
      firstLatitude / RAD + deltaLatitude / RAD * middle, transform, output);
    if ((output[2]! >= 0) === firstVisible) low = middle; else high = middle;
  }
  const middle = (low + high) * 0.5;
  projectRaw(firstLongitude / RAD + deltaLongitude / RAD * middle,
    firstLatitude / RAD + deltaLatitude / RAD * middle, transform, output);
}

function createGradients(context: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const existing = GRADIENTS.get(context);
  if (existing && existing.width === width && existing.height === height && existing.radius === radius) return existing;
  const cx = width / 2; const cy = height / 2;
  const ocean = context.createRadialGradient(cx - radius * 0.32, cy - radius * 0.38, radius * 0.08, cx, cy, radius);
  ocean.addColorStop(0, '#d9faff'); ocean.addColorStop(0.5, '#69c8f6'); ocean.addColorStop(1, '#386edf');
  const aura = context.createRadialGradient(cx - radius * 0.25, cy - radius * 0.35, radius * 0.15, cx, cy, radius * 1.2);
  aura.addColorStop(0, 'rgba(76,141,255,.2)'); aura.addColorStop(0.7, 'rgba(53,208,127,.1)');
  aura.addColorStop(1, 'rgba(53,208,127,0)');
  const gradients = { width, height, radius, ocean, aura };
  GRADIENTS.set(context, gradients);
  return gradients;
}

function findHiddenPoint(ring: PreparedRing, transform: Transform): number {
  for (let index = 0; index < ring.count; index++) {
    project(ring, index, transform, PROJECTED);
    if (PROJECTED[2]! < 0) return index;
  }
  return -1;
}

function drawLandRing(context: CanvasRenderingContext2D, ring: PreparedRing, transform: Transform,
  cx: number, cy: number, active: boolean): void {
  const hidden = findHiddenPoint(ring, transform);
  if (hidden < 0) {
    context.beginPath();
    for (let index = 0; index < ring.count; index++) {
      project(ring, index, transform, PROJECTED);
      if (index === 0) context.moveTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
      else context.lineTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
    }
    context.closePath();
    context.fillStyle = active ? '#e8fff2' : '#f1f9fb';
    context.fill();
    if (active) { context.strokeStyle = '#8a94a3'; context.lineWidth = 1.25; context.stroke(); }
    return;
  }

  let previous = hidden; let previousVisible = false; let entryAngle = 0;
  for (let step = 1; step <= ring.count; step++) {
    const index = (hidden + step) % ring.count;
    project(ring, index, transform, PROJECTED);
    const visible = PROJECTED[2]! >= 0;
    if (!previousVisible && visible) {
      projectHorizon(ring, previous, index, transform, EDGE);
      const entryX = EDGE[0]!; const entryY = EDGE[1]!;
      entryAngle = Math.atan2(entryY, entryX);
      context.beginPath();
      context.moveTo(cx + entryX, cy + entryY);
      project(ring, index, transform, PROJECTED);
      context.lineTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
    } else if (previousVisible && visible) {
      context.lineTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
    } else if (previousVisible) {
      projectHorizon(ring, previous, index, transform, EDGE);
      const exitX = EDGE[0]!; const exitY = EDGE[1]!;
      const exitAngle = Math.atan2(exitY, exitX);
      context.lineTo(cx + exitX, cy + exitY);
      const clockwise = (entryAngle - exitAngle + TAU) % TAU;
      context.arc(cx, cy, transform.radius, exitAngle, entryAngle, clockwise > PI);
      context.closePath();
      context.fillStyle = active ? '#e8fff2' : '#f1f9fb';
      context.fill();
      if (active) { context.strokeStyle = '#8a94a3'; context.lineWidth = 1.25; context.stroke(); }
    }
    previous = index;
    previousVisible = visible;
  }
}

function drawLand(context: CanvasRenderingContext2D, shapes: PreparedShape[], transform: Transform,
  cx: number, cy: number, activeContinent: string): void {
  for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
    const shape = shapes[shapeIndex]!;
    const active = Boolean(activeContinent) && shape.code === activeContinent;
    for (let ringIndex = 0; ringIndex < shape.rings.length; ringIndex++)
      drawLandRing(context, shape.rings[ringIndex]!, transform, cx, cy, active);
  }
}

function drawBorders(context: CanvasRenderingContext2D, shapes: PreparedShape[], transform: Transform,
  cx: number, cy: number, quality: QualityLevel): void {
  context.beginPath();
  for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
    const shape = shapes[shapeIndex]!;
    for (let ringIndex = 0; ringIndex < shape.rings.length; ringIndex++) {
      const ring = shape.rings[ringIndex]!;
      let previousVisible = false; let previous = ring.count - 1;
      for (let index = 0; index < ring.count; index++) {
        project(ring, index, transform, PROJECTED);
        const visible = PROJECTED[2]! >= 0;
        if (visible) {
          if (previousVisible) context.lineTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
          else context.moveTo(cx + PROJECTED[0]!, cy + PROJECTED[1]!);
        } else if (previousVisible) {
          projectHorizon(ring, previous, index, transform, EDGE);
          context.lineTo(cx + EDGE[0]!, cy + EDGE[1]!);
        }
        previousVisible = visible;
        previous = index;
      }
    }
  }
  context.strokeStyle = 'rgba(42,94,126,.46)';
  context.lineWidth = quality === 'low' ? 0.55 : quality === 'high' ? 0.85 : 0.7;
  context.stroke();
}

function drawCountryPoints(context: CanvasRenderingContext2D, transform: Transform, cx: number, cy: number,
  activeContinent: string, selectedCountryCodes: readonly string[], focusedCountryCode?: string | null): void {
  for (let index = 0; index < POINTS.length; index++) {
    const country = POINTS[index]!;
    const x = country.cosLatitude * (country.sinLongitude * transform.cosYaw - country.cosLongitude * transform.sinYaw);
    const z = country.cosLatitude * (country.sinLongitude * transform.sinYaw + country.cosLongitude * transform.cosYaw);
    const y = country.sinLatitude * transform.cosPitch - z * transform.sinPitch;
    const depth = country.sinLatitude * transform.sinPitch + z * transform.cosPitch;
    if (depth < 0) continue;
    const selected = selectedCountryCodes.includes(country.code);
    const focused = focusedCountryCode === country.code;
    context.beginPath(); context.arc(cx + x * transform.radius, cy - y * transform.radius,
      focused ? 7 : selected ? 6 : country.continentCode === activeContinent ? 4 : 2.3, 0, TAU);
    context.fillStyle = selected ? '#35B96F' : focused ? '#16864A'
      : country.continentCode === activeContinent ? '#78C994' : 'rgba(76,141,255,.6)';
    context.fill();
    if (selected || focused) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); }
  }
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

export function renderGlobe(context: CanvasRenderingContext2D, options: GlobeRenderOptions): number {
  const { width, height, rotation, activeContinent, quality,
    selectedCountryCodes = [], focusedCountryCode, zoom = 1 } = options;
  const cx = width / 2; const cy = height / 2;
  const radius = Math.min(width, height) * 0.46 * GLOBE_RADIUS_SCALE * zoom;
  const gradients = createGradients(context, width, height, radius);
  context.clearRect(0, 0, width, height);
  if (quality !== 'low') {
    context.fillStyle = gradients.aura; context.beginPath(); context.arc(cx, cy, radius * 1.2, 0, TAU); context.fill();
  }
  context.fillStyle = gradients.ocean; context.beginPath(); context.arc(cx, cy, radius, 0, TAU); context.fill();
  TRANSFORM.cosYaw = Math.cos(rotation.longitude * RAD);
  TRANSFORM.sinYaw = Math.sin(rotation.longitude * RAD);
  TRANSFORM.cosPitch = Math.cos(rotation.latitude * RAD);
  TRANSFORM.sinPitch = Math.sin(rotation.latitude * RAD);
  TRANSFORM.radius = radius;
  const transform = TRANSFORM;
  context.save(); context.beginPath(); context.arc(cx, cy, radius - 1, 0, TAU); context.clip();
  const polygonStarted = now();
  drawLand(context, quality === 'low' ? LAND.low : LAND.high, transform, cx, cy, activeContinent);
  drawBorders(context, BORDERS[quality], transform, cx, cy, quality);
  const polygonMs = now() - polygonStarted;
  drawCountryPoints(context, transform, cx, cy, activeContinent, selectedCountryCodes, focusedCountryCode);
  context.restore();
  context.strokeStyle = 'rgba(190,231,255,.72)'; context.lineWidth = quality === 'low' ? 2 : 3;
  context.beginPath(); context.arc(cx, cy, radius, 0, TAU); context.stroke();
  return polygonMs;
}
