import { pointAlong } from '../graph/geo';
import { pieceLengthM } from '../graph/route';
import type { LngLat, PedestrianGraph } from '../graph/types';
import type { RouteCandidate } from './engine';

/**
 * Where to pin a route's time label: on a stretch no other shown route uses (so labels for
 * different routes never share a street), as close as possible to the middle of the route, which
 * keeps labels away from the screen edges and the A/B markers. Falls back to the midpoint.
 */
export function calloutPoint(graph: PedestrianGraph, route: RouteCandidate, others: RouteCandidate[]): LngLat {
  const shared = new Set(others.flatMap((o) => o.pieces.map((p) => p.segment)));
  const total = route.metrics.distanceM;
  let along = 0;
  let best: { segment: number; mid: number; score: number } | null = null;
  for (const p of route.pieces) {
    const len = pieceLengthM(graph, p);
    if (!shared.has(p.segment) && len >= 15) {
      const centre = along + len / 2;
      const score = Math.abs(centre - total / 2);
      if (!best || score < best.score) best = { segment: p.segment, mid: (p.fromFrac + p.toFrac) / 2, score };
    }
    along += len;
  }
  if (best) {
    const seg = graph.segments[best.segment]!;
    return pointAlong(seg.coords, seg.cumulative, best.mid * seg.length);
  }
  const coords = route.geometry.coordinates;
  return coords[Math.floor(coords.length / 2)] ?? coords[0]!;
}
