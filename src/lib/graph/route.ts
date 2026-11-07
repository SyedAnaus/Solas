import { slicePolyline } from './geo';
import type { RoutePiece } from './search';
import type { LngLat, PedestrianGraph } from './types';

export interface RouteGeometry {
  /** Walk-ordered coordinates from start to end, built only from segment geometry. */
  coordinates: LngLat[];
  pieces: RoutePiece[];
}

/** Length in metres of one piece, from the segment's source length. */
export function pieceLengthM(graph: PedestrianGraph, piece: RoutePiece): number {
  return Math.abs(piece.toFrac - piece.fromFrac) * graph.segments[piece.segment]!.length;
}

/** Concatenate the actual geometry of each walked piece. No straight-line gaps are invented. */
export function buildRouteGeometry(graph: PedestrianGraph, pieces: RoutePiece[]): RouteGeometry {
  const coordinates: LngLat[] = [];
  for (const piece of pieces) {
    const seg = graph.segments[piece.segment]!;
    const part = slicePolyline(seg.coords, seg.cumulative, piece.fromFrac, piece.toFrac);
    for (const c of part) {
      const last = coordinates[coordinates.length - 1];
      if (last && Math.abs(last[0] - c[0]) < 1e-9 && Math.abs(last[1] - c[1]) < 1e-9) continue;
      coordinates.push(c);
    }
  }
  return { coordinates, pieces };
}

/** Segment ids walked, with metres on each, for overlap/deduplication checks. */
export function segmentUsage(graph: PedestrianGraph, pieces: RoutePiece[]): Map<number, number> {
  const usage = new Map<number, number>();
  for (const piece of pieces) usage.set(piece.segment, (usage.get(piece.segment) ?? 0) + pieceLengthM(graph, piece));
  return usage;
}
