import { ROUTING_CONFIG } from '../../config/routing';
import { haversineM } from '../graph/geo';
import { buildRouteGeometry, type RouteGeometry } from '../graph/route';
import { findPath, type PieceCost, type RoutePiece } from '../graph/search';
import { SegmentIndex, snapToNetwork, type SnapFailure, type SnapResult } from '../graph/spatialIndex';
import type { LngLat, PedestrianGraph, Segment } from '../graph/types';
import { makeCost } from '../scoring/costs';
import { computeRouteMetrics, type RouteMetrics } from '../scoring/metrics';

export type RoutePreference = 'fastest' | 'better_lit' | 'easier' | 'step_free';

export interface RouteCandidate {
  id: string;
  /** Preferences this physical route satisfies (several options can share one route). */
  preferences: RoutePreference[];
  pieces: RoutePiece[];
  geometry: RouteGeometry;
  metrics: RouteMetrics;
  /** One-sentence, evidence-based reason this route is shown. */
  rationale: string;
}

export type PlanError =
  | { kind: 'snap'; which: 'origin' | 'destination'; failure: SnapFailure }
  | { kind: 'same-place'; message: string }
  | { kind: 'no-path'; message: string };

export type PlanOutcome =
  | { ok: true; origin: SnapResult; destination: SnapResult; routes: RouteCandidate[]; computeMs: number }
  | { ok: false; error: PlanError; computeMs: number };

/** True for segments the router may use in any mode. */
export function isRoutable(segment: Segment, excludeIndoor: boolean = ROUTING_CONFIG.excludeIndoor): boolean {
  if (!excludeIndoor) return true;
  return segment.tags.highway !== 'corridor' && segment.tags.indoor !== 'yes';
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Owns the graph and its spatial index; computes routes between arbitrary points. */
export class RoutingEngine {
  readonly index: SegmentIndex;

  constructor(
    readonly graph: PedestrianGraph,
    readonly config = ROUTING_CONFIG,
  ) {
    this.index = new SegmentIndex(graph, config.spatialIndexCellM);
  }

  snap(point: LngLat) {
    return snapToNetwork(this.graph, this.index, point, this.config.maxSnapDistanceM, (seg) => isRoutable(seg, this.config.excludeIndoor));
  }

  /** Run one search and package the result. Returns null when no permitted path exists. */
  route(origin: SnapResult, destination: SnapResult, cost: PieceCost): { pieces: RoutePiece[]; cost: number } | null {
    const result = findPath(this.graph, {
      start: origin,
      end: destination,
      cost,
      heuristicCostPerMetre: 1 / this.config.walkingSpeedMps,
    });
    return result ? { pieces: result.pieces, cost: result.cost } : null;
  }

  describe(pieces: RoutePiece[]): { geometry: RouteGeometry; metrics: RouteMetrics } {
    return {
      geometry: buildRouteGeometry(this.graph, pieces),
      metrics: computeRouteMetrics(this.graph, pieces, {
        speedMps: this.config.walkingSpeedMps,
        percentStep: this.config.percentRoundingStep,
      }),
    };
  }

  /** Phase 2: the fastest walking route between two points. */
  planFastest(originPoint: LngLat, destinationPoint: LngLat): PlanOutcome {
    const t0 = now();
    const done = <T extends object>(value: T) => ({ ...value, computeMs: now() - t0 });

    const origin = this.snap(originPoint);
    if (!origin.ok) return done({ ok: false as const, error: { kind: 'snap' as const, which: 'origin' as const, failure: origin.error } });
    const destination = this.snap(destinationPoint);
    if (!destination.ok) {
      return done({ ok: false as const, error: { kind: 'snap' as const, which: 'destination' as const, failure: destination.error } });
    }
    if (haversineM(origin.snap.point, destination.snap.point) < this.config.minTripDistanceM) {
      return done({
        ok: false as const,
        error: { kind: 'same-place' as const, message: 'Start and destination are the same place. Choose two different points.' },
      });
    }

    const fastestCost = makeCost({
      speedMps: this.config.walkingSpeedMps,
      exclude: (seg) => !isRoutable(seg, this.config.excludeIndoor),
    });
    const found = this.route(origin.snap, destination.snap, fastestCost);
    if (!found) {
      return done({
        ok: false as const,
        error: {
          kind: 'no-path' as const,
          message: 'No connected walking route was found between these points in the mapped network.',
        },
      });
    }
    const { geometry, metrics } = this.describe(found.pieces);
    const fastest: RouteCandidate = {
      id: 'fastest',
      preferences: ['fastest'],
      pieces: found.pieces,
      geometry,
      metrics,
      rationale: 'Shortest walking time on the mapped network.',
    };
    return done({ ok: true as const, origin: origin.snap, destination: destination.snap, routes: [fastest] });
  }
}
