import type { LngLat } from './types';

/** Mean Earth radius used by OSMnx's great-circle lengths (metres). */
export const EARTH_RADIUS_M = 6_371_009;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function polylineLengthM(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1]!, coords[i]!);
  return total;
}

/**
 * Local equirectangular projection around a reference latitude. Accurate to well under 0.1% over
 * the few kilometres Solas covers, and much cheaper than haversine for nearest-point searches.
 */
export interface LocalProjection {
  toXY(p: LngLat): [number, number];
  toLngLat(xy: [number, number]): LngLat;
}

export function localProjection(refLat: number, refLon = 0): LocalProjection {
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(toRad(refLat));
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  return {
    toXY: (p) => [(p[0] - refLon) * kx, (p[1] - refLat) * ky],
    toLngLat: ([x, y]) => [x / kx + refLon, y / ky + refLat],
  };
}

/** Closest point on segment AB to P in planar coordinates; returns t in [0,1] and squared distance. */
export function closestOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { t: number; dist2: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return { t, dist2: x * x + y * y };
}

/** Ray-casting point-in-polygon for a single ring of [lon, lat] vertices. */
export function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Cumulative distances along a polyline, scaled so the final value equals `targetLength`. */
export function cumulativeDistances(coords: LngLat[], targetLength: number): Float64Array {
  const out = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) out[i] = out[i - 1]! + haversineM(coords[i - 1]!, coords[i]!);
  const raw = out[coords.length - 1] ?? 0;
  if (raw > 0 && targetLength > 0) {
    const k = targetLength / raw;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * k;
  }
  return out;
}

/** Point at `distance` metres along a polyline with precomputed cumulative distances. */
export function pointAlong(coords: LngLat[], cumulative: Float64Array, distance: number): LngLat {
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (distance <= 0) return coords[0]!;
  if (distance >= total) return coords[coords.length - 1]!;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= distance) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi]! - cumulative[lo]!;
  const t = span > 0 ? (distance - cumulative[lo]!) / span : 0;
  const a = coords[lo]!;
  const b = coords[hi]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * The sub-polyline between fractions `from` and `to` (0..1) of the total length.
 * If from > to the result runs backwards, which is how a segment walked v→u is drawn.
 */
export function slicePolyline(coords: LngLat[], cumulative: Float64Array, from: number, to: number): LngLat[] {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const reverse = from > to;
  const a = Math.max(0, Math.min(1, Math.min(from, to))) * total;
  const b = Math.max(0, Math.min(1, Math.max(from, to))) * total;
  const out: LngLat[] = [pointAlong(coords, cumulative, a)];
  for (let i = 0; i < coords.length; i++) {
    const d = cumulative[i]!;
    if (d > a && d < b) out.push(coords[i]!);
  }
  out.push(pointAlong(coords, cumulative, b));
  return reverse ? out.reverse() : out;
}
