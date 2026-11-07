import { closestOnSegment, localProjection, pointInRing, type LocalProjection } from './geo';
import type { LngLat, PedestrianGraph, Segment } from './types';

/** A point on the walking network that a user's chosen location was matched to. */
export interface SnapResult {
  segment: number;
  /** Position along the segment from its `u` end, as a fraction 0..1 of its length. */
  fraction: number;
  /** The matched point on the network. */
  point: LngLat;
  /** Straight-line distance from the requested location to the matched point (metres). */
  distanceM: number;
}

export type SnapFailure =
  | { reason: 'outside-coverage'; message: string }
  | { reason: 'too-far'; message: string; nearestDistanceM: number | null };

export type SnapOutcome = { ok: true; snap: SnapResult } | { ok: false; error: SnapFailure };

interface IndexedPiece {
  segment: number;
  /** Index of the first vertex of this straight piece within the segment's coords. */
  vertex: number;
}

/**
 * Uniform grid over every straight piece of every segment, in a local metric projection.
 * Answers "nearest walkable point within R metres" without scanning the whole graph.
 */
export class SegmentIndex {
  private readonly projection: LocalProjection;
  private readonly cells = new Map<string, IndexedPiece[]>();
  private readonly projected: [number, number][][];

  constructor(
    private readonly graph: PedestrianGraph,
    private readonly cellM: number,
  ) {
    const [w, s, e, n] = graph.meta.coverage.bbox;
    this.projection = localProjection((s + n) / 2, (w + e) / 2);
    this.projected = graph.segments.map((seg) => seg.coords.map((c) => this.projection.toXY(c)));
    graph.segments.forEach((seg, segId) => {
      const pts = this.projected[segId]!;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[i + 1]!;
        const x0 = Math.floor(Math.min(ax, bx) / cellM);
        const x1 = Math.floor(Math.max(ax, bx) / cellM);
        const y0 = Math.floor(Math.min(ay, by) / cellM);
        const y1 = Math.floor(Math.max(ay, by) / cellM);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = `${cx}:${cy}`;
            let bucket = this.cells.get(key);
            if (!bucket) this.cells.set(key, (bucket = []));
            bucket.push({ segment: seg.id, vertex: i });
          }
        }
      }
    });
  }

  /**
   * Nearest point on any segment accepted by `filter`, within `maxDistanceM`.
   * Returns null when nothing is that close.
   */
  nearest(point: LngLat, maxDistanceM: number, filter: (seg: Segment) => boolean = () => true): SnapResult | null {
    const p = this.projection.toXY(point);
    const r = Math.ceil(maxDistanceM / this.cellM);
    const cx = Math.floor(p[0] / this.cellM);
    const cy = Math.floor(p[1] / this.cellM);
    let best: { segment: number; vertex: number; t: number; dist2: number } | null = null;
    const seen = new Set<number>();
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = this.cells.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const piece of bucket) {
          const key = piece.segment * 65536 + piece.vertex;
          if (seen.has(key)) continue;
          seen.add(key);
          const seg = this.graph.segments[piece.segment]!;
          if (!filter(seg)) continue;
          const pts = this.projected[piece.segment]!;
          const hit = closestOnSegment(p, pts[piece.vertex]!, pts[piece.vertex + 1]!);
          if (
            !best ||
            hit.dist2 < best.dist2 - 1e-9 ||
            // Deterministic tie-break: lower segment id, then lower vertex.
            (Math.abs(hit.dist2 - best.dist2) <= 1e-9 &&
              (piece.segment < best.segment || (piece.segment === best.segment && piece.vertex < best.vertex)))
          ) {
            best = { segment: piece.segment, vertex: piece.vertex, t: hit.t, dist2: hit.dist2 };
          }
        }
      }
    }
    if (!best) return null;
    const distanceM = Math.sqrt(best.dist2);
    if (distanceM > maxDistanceM) return null;

    const seg = this.graph.segments[best.segment]!;
    const a = seg.cumulative[best.vertex]!;
    const b = seg.cumulative[best.vertex + 1]!;
    const along = a + (b - a) * best.t;
    const pa = seg.coords[best.vertex]!;
    const pb = seg.coords[best.vertex + 1]!;
    const snapped: LngLat = [pa[0] + (pb[0] - pa[0]) * best.t, pa[1] + (pb[1] - pa[1]) * best.t];
    return { segment: seg.id, fraction: seg.length > 0 ? along / seg.length : 0, point: snapped, distanceM };
  }
}

/** Check coverage, then snap to the nearest permitted segment, with clear reasons on failure. */
export function snapToNetwork(
  graph: PedestrianGraph,
  index: SegmentIndex,
  point: LngLat,
  maxDistanceM: number,
  filter?: (seg: Segment) => boolean,
): SnapOutcome {
  const ring = graph.meta.coverage.coordinates[0];
  if (ring && !pointInRing(point, ring)) {
    return {
      ok: false,
      error: {
        reason: 'outside-coverage',
        message: `This point is outside the area Solas has walking data for (${graph.meta.areaName}).`,
      },
    };
  }
  const snap = index.nearest(point, maxDistanceM, filter);
  if (snap) return { ok: true, snap };
  const wider = index.nearest(point, maxDistanceM * 4, filter);
  return {
    ok: false,
    error: {
      reason: 'too-far',
      nearestDistanceM: wider ? Math.round(wider.distanceM) : null,
      message: wider
        ? `The nearest mapped walkway is about ${Math.round(wider.distanceM)} m away (limit ${maxDistanceM} m). Try a point on a street or path.`
        : `No mapped walkway within ${maxDistanceM * 4} m of this point. Try a point on a street or path.`,
    },
  };
}
