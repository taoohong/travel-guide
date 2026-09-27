/* global URL, console */
import { readFileSync, writeFileSync } from 'node:fs';

// Source: Natural Earth land, public domain. https://www.naturalearthdata.com/about/terms-of-use/
const base = new URL('../src/assets/geo/', import.meta.url);
const centers = JSON.parse(readFileSync(new URL('continent-centers.json', base)));
const distance = (a, b) => {
  const lat1 = a[1] * Math.PI / 180; const lat2 = b.latitude * Math.PI / 180;
  const lon = (((a[0] - b.longitude + 540) % 360) - 180) * Math.PI / 180;
  return Math.acos(Math.max(-1, Math.min(1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon))));
};
const perpendicular = (p, a, b) => {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
function simplify(points, tolerance) {
  if (points.length < 4) return points;
  let max = 0; let index = 0;
  for (let i = 1; i < points.length - 1; i++) { const d = perpendicular(points[i], points[0], points.at(-1)); if (d > max) { max = d; index = i; } }
  if (max <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
for (const [scale, tolerance, minimumArea] of [['50', .16, .09], ['110', .35, .14]]) {
  const source = JSON.parse(readFileSync(new URL(`ne_${scale}m_land.geojson`, base)));
  const shapes = [];
  for (const feature of source.features) {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const polygon of polygons) for (const ring of polygon.slice(0, 1)) {
      const points = simplify(ring, tolerance).map(([lon, lat]) => [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100]);
      if (points.length < 4) continue;
      const area = Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
      if (area < minimumArea) continue;
      const midpoint = points[Math.floor(points.length / 2)];
      const continent = centers.reduce((best, center) => distance(midpoint, center) < distance(midpoint, best) ? center : best, centers[0]);
      shapes.push({ code: continent.code, points });
    }
  }
  const name = scale === '50' ? 'land-high.json' : 'land-low.json';
  writeFileSync(new URL(name, base), JSON.stringify(shapes));
  console.log(name, shapes.length, shapes.reduce((sum, shape) => sum + shape.points.length, 0), 'points');
}
