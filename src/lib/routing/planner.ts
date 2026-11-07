import { ROUTING_CONFIG, type LightingPenalty } from '../../config/routing';
import { haversineM } from '../graph/geo';
import type { RoutePiece } from '../graph/search';
import type { SnapResult } from '../graph/spatialIndex';
import type { LngLat, Segment } from '../graph/types';
import { makeCost } from '../scoring/costs';
import { assessLighting, judgeBetterLit, type BetterLitJudgement, type LightingAssessment } from '../scoring/lightingScore';
import { dedupeRoutes, routeOverlap, routeSignature } from './candidates';
import { isRoutable, type PlanError, type RouteCandidate, type RoutingEngine } from './engine';
import { betterLitRationale, fastestRationale } from './explain';
import type { RoutePreferences, RouteRole } from './preferences';

export interface PlanNotice {
  id: string;
  tone: 'info' | 'warning';
  title: string;
  message: string;
}

export interface PlanStats {
  /** Searches run (fastest + lighting-weighted). */
  searches: number;
  /** Distinct physical paths found by lighting-weighted searches, excluding the fastest. */
  distinctAlternatives: number;
}

export type PlanResult =
  | {
      ok: true;
      origin: SnapResult;
      destination: SnapResult;
      routes: RouteCandidate[];
      /** The route matching the user's mode; the UI selects it by default. */
      recommendedId: string;
      notices: PlanNotice[];
      stats: PlanStats;
      computeMs: number;
    }
  | { ok: false; error: PlanError; computeMs: number };

interface Evaluated {
  pieces: RoutePiece[];
  source: string;
  order: number;
  signature: string;
  metrics: RouteCandidate['metrics'];
  assessment: LightingAssessment;
  judgement: BetterLitJudgement;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Deterministic ranking: utility, then less extra time, less unknown, then path signature. */
export function compareCandidates(a: Evaluated, b: Evaluated): number {
  return (
    b.judgement.utility - a.judgement.utility ||
    a.judgement.extraS - b.judgement.extraS ||
    a.assessment.unknownPct - b.assessment.unknownPct ||
    (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0)
  );
}

/**
 * Plan routes between two points: the fastest route plus, when real data supports it, a
 * meaningfully better-lit alternative within the user's detour cap.
 */
export function planRoutes(engine: RoutingEngine, originPoint: LngLat, destinationPoint: LngLat, prefs: RoutePreferences): PlanResult {
  const t0 = now();
  const cfg = engine.config;
  const done = (value: Omit<Extract<PlanResult, { ok: true }>, 'computeMs'> | { ok: false; error: PlanError }): PlanResult =>
    ({ ...value, computeMs: now() - t0 }) as PlanResult;

  const exclude = (seg: Segment) => !isRoutable(seg, cfg.excludeIndoor);
  const origin = engine.snap(originPoint);
  if (!origin.ok) return done({ ok: false, error: { kind: 'snap', which: 'origin', failure: origin.error } });
  const destination = engine.snap(destinationPoint);
  if (!destination.ok) return done({ ok: false, error: { kind: 'snap', which: 'destination', failure: destination.error } });
  if (haversineM(origin.snap.point, destination.snap.point) < cfg.minTripDistanceM) {
    return done({ ok: false, error: { kind: 'same-place', message: 'Start and destination are the same place. Choose two different points.' } });
  }

  // 1. Baseline: minimum walking time.
  const fastestFound = engine.route(origin.snap, destination.snap, makeCost({ speedMps: cfg.walkingSpeedMps, exclude }));
  if (!fastestFound) {
    return done({
      ok: false,
      error: { kind: 'no-path', message: 'No connected walking route was found between these points in the mapped network.' },
    });
  }
  const fastestDesc = engine.describe(fastestFound.pieces);
  const fastestAssessment = assessLighting(fastestDesc.metrics.lighting);
  const fastestDurationS = fastestDesc.metrics.durationS;
  const maxExtraS = prefs.maxDetourMin * 60;

  // 2. Candidate generation: the same graph searched with varied, non-negative lighting penalties.
  const profiles: readonly LightingPenalty[] = ROUTING_CONFIG.lighting.penaltyProfiles[prefs.lightingEmphasis];
  const raw: { pieces: RoutePiece[]; source: string; order: number }[] = [];
  profiles.forEach((penalty, order) => {
    const found = engine.route(origin.snap, destination.snap, makeCost({ speedMps: cfg.walkingSpeedMps, lighting: penalty, exclude }));
    if (found) raw.push({ pieces: found.pieces, source: `lighting-${prefs.lightingEmphasis}-${order + 1}`, order });
  });
  const { kept } = dedupeRoutes(engine.graph, raw, cfg.duplicateOverlapRatio, [fastestFound.pieces]);

  const evaluated: Evaluated[] = kept.map((c) => {
    const { metrics } = engine.describe(c.pieces);
    const assessment = assessLighting(metrics.lighting);
    return {
      ...c,
      signature: routeSignature(c.pieces),
      metrics,
      assessment,
      judgement: judgeBetterLit(
        { assessment: fastestAssessment, durationS: fastestDurationS },
        { assessment, durationS: metrics.durationS },
        maxExtraS,
      ),
    };
  });

  const withinCap = evaluated.filter((e) => e.judgement.qualifies).sort(compareCandidates);
  const overCapOnly = evaluated
    .filter((e) => e.judgement.rejections.length === 1 && e.judgement.rejections[0] === 'over-cap')
    .sort(compareCandidates);

  const notices: PlanNotice[] = [];
  const routes: RouteCandidate[] = [];
  const best = withinCap[0];
  const fastestRoles: RouteRole[] = ['fastest'];
  if (!best && evaluated.length === 0) fastestRoles.push('better_lit'); // same physical route is optimal
  const fastest = engine.buildRoute('fastest', fastestRoles, fastestFound.pieces, fastestDurationS, fastestRationale(fastestDesc.metrics));
  routes.push(fastest);

  if (best) {
    routes.push(
      engine.buildRoute('better_lit', ['better_lit'], best.pieces, fastestDurationS, betterLitRationale(fastestDesc.metrics, best.metrics, best.judgement.extraS)),
    );
  } else {
    notices.push(explainNoBetterLit(evaluated, overCapOnly[0], prefs, profiles.length));
  }

  if (!best && overCapOnly[0] && prefs.showLongerAlternatives) {
    const longer = overCapOnly[0];
    const route = engine.buildRoute(
      'better_lit_longer',
      ['better_lit'],
      longer.pieces,
      fastestDurationS,
      betterLitRationale(fastestDesc.metrics, longer.metrics, longer.judgement.extraS),
      true,
    );
    route.warnings.unshift(`Longer than your ${prefs.maxDetourMin}-minute limit. Shown because "Show longer alternatives" is on.`);
    routes.push(route);
  }

  // Guard: no two returned routes may be the same physical path.
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (routeOverlap(engine.graph, routes[i]!.pieces, routes[j]!.pieces) >= cfg.duplicateOverlapRatio) {
        throw new Error('Planner produced duplicate routes');
      }
    }
  }

  const recommendedId =
    prefs.mode === 'better_lit' ? (routes.find((r) => r.roles.includes('better_lit') && !r.overCap)?.id ?? 'fastest') : 'fastest';

  return done({
    ok: true,
    origin: origin.snap,
    destination: destination.snap,
    routes,
    recommendedId,
    notices,
    stats: { searches: 1 + profiles.length, distinctAlternatives: evaluated.length },
  });
}

function explainNoBetterLit(evaluated: Evaluated[], overCap: Evaluated | undefined, prefs: RoutePreferences, searches: number): PlanNotice {
  const cfg = ROUTING_CONFIG.lighting;
  if (overCap) {
    const extra = Math.round(overCap.judgement.extraS / 60);
    return {
      id: 'better-lit-over-cap',
      tone: 'info',
      title: 'Better-lit route is longer than your limit',
      message: prefs.showLongerAlternatives
        ? `A better-lit route adds about ${extra} min, more than your ${prefs.maxDetourMin}-minute limit. It is shown with a warning.`
        : `A better-lit route exists but adds about ${extra} min, more than your ${prefs.maxDetourMin}-minute limit. Raise the limit or turn on "Show longer alternatives" in Fine-tune to see it.`,
    };
  }
  if (evaluated.length === 0) {
    return {
      id: 'better-lit-same-route',
      tone: 'info',
      title: 'The fastest route is also the best lit we found',
      message: `${searches} lighting-weighted searches all returned the same path, so there is no separate better-lit option.`,
    };
  }
  const top = [...evaluated].sort((a, b) => b.judgement.gainPts - a.judgement.gainPts)[0]!;
  const r = top.judgement.rejections;
  if (r.includes('too-sparse') && top.judgement.gainPts > 0) {
    return {
      id: 'better-lit-sparse',
      tone: 'warning',
      title: 'Not enough lighting data to compare',
      message: `Alternatives have lighting information on less than ${cfg.minEvidenceCoveragePct}% of their length, so Solas cannot say they are better lit.`,
    };
  }
  if (r.includes('more-unlit')) {
    return {
      id: 'better-lit-more-unlit',
      tone: 'info',
      title: 'No better-lit alternative',
      message: 'The alternatives found would add stretches mapped as unlit, so the fastest route is shown.',
    };
  }
  const gain = Math.max(0, Math.round(top.judgement.gainPts));
  return {
    id: 'better-lit-small-gain',
    tone: 'info',
    title: 'No meaningfully better-lit alternative',
    message:
      gain > 0
        ? `The best alternative improves mapped-or-likely-lit walking by about ${gain} points, less than the ${cfg.minImprovementPts}-point threshold.`
        : 'The alternatives found do not have more lighting evidence than the fastest route.',
  };
}
