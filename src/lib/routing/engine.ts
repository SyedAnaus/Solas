import { ROUTING_CONFIG } from '../../config/routing';
import { haversineM } from '../graph/geo';
import { buildRouteGeometry, type RouteGeometry } from '../graph/route';
import { findPath, type PieceCost, type RoutePiece } from '../graph/search';
import { SegmentIndex, snapToNetwork, type SnapFailure, type SnapResult } from '../graph/spatialIndex';
import type { LngLat, PedestrianGraph, Segment } from '../graph/types';
import { makeCost } from '../scoring/costs';
import { routeEvidence, type EvidenceStretch } from '../scoring/evidence';
import { computeAccessibility, type AccessibilitySummary } from '../scoring/accessibility';
import { assessLighting, type LightingAssessment } from '../scoring/lightingScore';
import { computeRouteMetrics, type RouteMetrics } from '../scoring/metrics';
import { fastestRationale, lightingWarnings } from './explain';
import type { RouteRole } from './preferences';

export type { RouteRole } from './preferences';

/** A physical route shown to the user. Several roles can share one route (deduplicated). */
export interface RouteCandidate {
  id: string;
  roles: RouteRole[];
  pieces: RoutePiece[];
  geometry: RouteGeometry;
  metrics: RouteMetrics;
  lighting: LightingAssessment;
  /** Extra walking time compared with the fastest route (seconds, >= 0). */
  extraS: number;
  /** True only for an alternative beyond the user's detour cap, shown on explicit request. */
  overCap: boolean;
  /** One-sentence, evidence-based reason this route is shown. */
  rationale: string;
  /** Data-quality and coverage warnings specific to this route. */
  warnings: string[];
  /** Lighting stretches in walking order with geometry and provenance. */
  evidence: EvidenceStretch[];
  /** Steps, surfaces, slope tags, kerbs, crossings and data gaps along the route. */
  accessibility: AccessibilitySummary;
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

  snap(point: LngLat, filter?: (seg: Segment) => boolean) {
    return snapToNetwork(
      this.graph,
      this.index,
      point,
      this.config.maxSnapDistanceM,
      (seg) =>
        (seg.forwardAllowed || seg.backwardAllowed) && isRoutable(seg, this.config.excludeIndoor) && (filter ? filter(seg) : true),
    );
  }

  /** Run one search. Returns null when no permitted path exists. */
  route(
    origin: SnapResult,
    destination: SnapResult,
    cost: PieceCost,
    nodeAllowed?: (node: number) => boolean,
  ): { pieces: RoutePiece[]; cost: number } | null {
    const result = findPath(this.graph, {
      start: origin,
      end: destination,
      cost,
      heuristicCostPerMetre: 1 / this.config.walkingSpeedMps,
      ...(nodeAllowed ? { nodeAllowed } : {}),
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

  /** Package a found path as a user-facing route with metrics, evidence and warnings. */
  buildRoute(
    id: string,
    roles: RouteRole[],
    pieces: RoutePiece[],
    fastestDurationS: number,
    rationale: string,
    overCap = false,
  ): RouteCandidate {
    const { geometry, metrics } = this.describe(pieces);
    return {
      id,
      roles,
      pieces,
      geometry,
      metrics,
      lighting: assessLighting(metrics.lighting),
      extraS: Math.max(0, metrics.durationS - fastestDurationS),
      overCap,
      rationale,
      warnings: lightingWarnings(metrics),
      evidence: routeEvidence(this.graph, pieces),
      accessibility: computeAccessibility(this.graph, pieces),
    };
  }

  /** The fastest walking route only (used by tests and as the planner's baseline). */
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
    const cost = makeCost({ speedMps: this.config.walkingSpeedMps, exclude: (seg) => !isRoutable(seg, this.config.excludeIndoor) });
    const found = this.route(origin.snap, destination.snap, cost);
    if (!found) {
      return done({
        ok: false as const,
        error: { kind: 'no-path' as const, message: 'No connected walking route was found between these points in the mapped network.' },
      });
    }
    const { metrics } = this.describe(found.pieces);
    const fastest = this.buildRoute('fastest', ['fastest'], found.pieces, metrics.durationS, fastestRationale(metrics));
    return done({ ok: true as const, origin: origin.snap, destination: destination.snap, routes: [fastest] });
  }
}
