import { ROUTING_CONFIG, type LightingPenalty } from '../../config/routing';
import { haversineM } from '../graph/geo';
import type { RoutePiece } from '../graph/search';
import type { SnapResult } from '../graph/spatialIndex';
import type { LngLat, Segment } from '../graph/types';
import {
  computeAccessibility,
  effortMultiplier,
  inclineOnlyMultiplier,
  isSteps,
  nodeStepFreeBlock,
  segmentStepFreeBlock,
  surfaceOnlyMultiplier,
  type AccessibilitySummary,
} from '../scoring/accessibility';
import { makeCost } from '../scoring/costs';
import { assessLighting, judgeBetterLit, type BetterLitJudgement, type LightingAssessment } from '../scoring/lightingScore';
import { dedupeRoutes, routeSignature } from './candidates';
import { isRoutable, type PlanError, type RouteCandidate, type RoutingEngine } from './engine';
import { betterLitRationale, easierRationale, fastestRationale, stepFreeRationale } from './explain';
import type { RouteMode, RoutePreferences } from './preferences';

export interface PlanNotice {
  id: string;
  tone: 'info' | 'warning';
  title: string;
  message: string;
}

export interface PlanStats {
  /** Searches run, including the fastest baseline. */
  searches: number;
  /** Distinct physical paths found by the mode's searches, excluding the fastest. */
  distinctAlternatives: number;
}

export type PlanResult =
  | {
      ok: true;
      mode: RouteMode;
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

type PlanOk = Extract<PlanResult, { ok: true }>;

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

interface Context {
  engine: RoutingEngine;
  prefs: RoutePreferences;
  origin: SnapResult;
  destination: SnapResult;
  /** Exclusion shared by every search (indoor passages; steps when "avoid steps" is on). */
  exclude: (seg: Segment) => boolean;
  /** Optional surface preference applied to better-lit and step-free searches. */
  surfaceFactor?: (seg: Segment) => number;
  fastest: RouteCandidate;
  maxExtraS: number;
}

interface ModeResult {
  routes: RouteCandidate[];
  notices: PlanNotice[];
  recommendedId: string;
  searches: number;
  distinct: number;
}

/**
 * Plan routes between two points for the user's preferences. Always returns the fastest route
 * (under the user's hard constraints) plus, when real data supports it, the mode's alternative.
 */
export function planRoutes(engine: RoutingEngine, originPoint: LngLat, destinationPoint: LngLat, prefs: RoutePreferences): PlanResult {
  const t0 = now();
  const cfg = engine.config;
  const done = (value: Omit<PlanOk, 'computeMs'> | { ok: false; error: PlanError }): PlanResult => ({ ...value, computeMs: now() - t0 }) as PlanResult;

  const stepFreeMode = prefs.mode === 'step_free';
  const exclude = (seg: Segment) => !isRoutable(seg, cfg.excludeIndoor) || (prefs.avoidSteps && isSteps(seg));
  const snapFilter = (seg: Segment) => !exclude(seg) && (!stepFreeMode || segmentStepFreeBlock(seg) === null);

  const snapEnd = (which: 'origin' | 'destination', point: LngLat) => {
    const r = engine.snap(point, snapFilter);
    if (r.ok) return r;
    if ((stepFreeMode || prefs.avoidSteps) && r.error.reason === 'too-far' && engine.snap(point).ok) {
      return {
        ok: false as const,
        error: {
          ...r.error,
          message: `The walkways near this ${which === 'origin' ? 'start' : 'destination'} have mapped steps or barriers, and no ${stepFreeMode ? 'step-free' : 'step-free-of-stairs'} walkway is within ${cfg.maxSnapDistanceM} m.`,
        },
      };
    }
    return r;
  };
  const origin = snapEnd('origin', originPoint);
  if (!origin.ok) return done({ ok: false, error: { kind: 'snap', which: 'origin', failure: origin.error } });
  const destination = snapEnd('destination', destinationPoint);
  if (!destination.ok) return done({ ok: false, error: { kind: 'snap', which: 'destination', failure: destination.error } });
  if (haversineM(origin.snap.point, destination.snap.point) < cfg.minTripDistanceM) {
    return done({ ok: false, error: { kind: 'same-place', message: 'Start and destination are the same place. Choose two different points.' } });
  }

  // Baseline: minimum walking time under the user's hard constraints.
  const fastestFound = engine.route(origin.snap, destination.snap, makeCost({ speedMps: cfg.walkingSpeedMps, exclude }));
  if (!fastestFound) {
    return done({
      ok: false,
      error: {
        kind: 'no-path',
        message: prefs.avoidSteps
          ? 'No walking route without mapped steps connects these points in the mapped network.'
          : 'No connected walking route was found between these points in the mapped network.',
      },
    });
  }
  const fastestMetrics = engine.describe(fastestFound.pieces).metrics;
  const fastest = engine.buildRoute('fastest', ['fastest'], fastestFound.pieces, fastestMetrics.durationS, fastestRationale(fastestMetrics));

  const ctx: Context = {
    engine,
    prefs,
    origin: origin.snap,
    destination: destination.snap,
    exclude,
    ...(prefs.preferSmoothSurfaces ? { surfaceFactor: (seg: Segment) => surfaceOnlyMultiplier(seg) } : {}),
    fastest,
    maxExtraS: prefs.maxDetourMin * 60,
  };

  const result =
    prefs.mode === 'easier' ? planEasier(ctx) : prefs.mode === 'step_free' ? planStepFree(ctx) : planBetterLit(ctx);

  // Invariant: no two returned routes are the same physical path.
  const seen = new Set<string>();
  for (const r of result.routes) {
    const sig = routeSignature(r.pieces);
    if (seen.has(sig)) throw new Error('Planner produced duplicate routes');
    seen.add(sig);
  }

  return done({
    ok: true,
    mode: prefs.mode,
    origin: origin.snap,
    destination: destination.snap,
    routes: result.routes,
    recommendedId: result.recommendedId,
    notices: result.notices,
    stats: { searches: 1 + result.searches, distinctAlternatives: result.distinct },
  });
}

/* ------------------------------------------------------------------------------- better lit */

function planBetterLit(ctx: Context): ModeResult {
  const { engine, prefs, fastest } = ctx;
  const cfg = engine.config;
  const profiles: readonly LightingPenalty[] = ROUTING_CONFIG.lighting.penaltyProfiles[prefs.lightingEmphasis];
  const raw: { pieces: RoutePiece[]; source: string; order: number }[] = [];
  profiles.forEach((penalty, order) => {
    const found = engine.route(
      ctx.origin,
      ctx.destination,
      makeCost({ speedMps: cfg.walkingSpeedMps, lighting: penalty, exclude: ctx.exclude, ...(ctx.surfaceFactor ? { segmentMultiplier: ctx.surfaceFactor } : {}) }),
    );
    if (found) raw.push({ pieces: found.pieces, source: `lighting-${prefs.lightingEmphasis}-${order + 1}`, order });
  });
  const { kept } = dedupeRoutes(engine.graph, raw, cfg.duplicateOverlapRatio, [fastest.pieces]);
  const fastestAssessment = fastest.lighting;
  const evaluated: Evaluated[] = kept.map((c) => {
    const { metrics } = engine.describe(c.pieces);
    const assessment = assessLighting(metrics.lighting);
    return {
      ...c,
      signature: routeSignature(c.pieces),
      metrics,
      assessment,
      judgement: judgeBetterLit({ assessment: fastestAssessment, durationS: fastest.metrics.durationS }, { assessment, durationS: metrics.durationS }, ctx.maxExtraS),
    };
  });

  const withinCap = evaluated.filter((e) => e.judgement.qualifies).sort(compareCandidates);
  const overCapOnly = evaluated.filter((e) => e.judgement.rejections.length === 1 && e.judgement.rejections[0] === 'over-cap').sort(compareCandidates);
  const routes: RouteCandidate[] = [fastest];
  const notices: PlanNotice[] = [];
  const best = withinCap[0];
  if (!best && evaluated.length === 0) fastest.roles.push('better_lit'); // the same physical route is optimal

  if (best) {
    routes.push(
      engine.buildRoute('better_lit', ['better_lit'], best.pieces, fastest.metrics.durationS, betterLitRationale(fastest.metrics, best.metrics, best.judgement.extraS)),
    );
  } else {
    notices.push(explainNoBetterLit(evaluated, overCapOnly[0], prefs, profiles.length));
    const longer = overCapOnly[0];
    if (longer && prefs.showLongerAlternatives) {
      const route = engine.buildRoute(
        'better_lit_longer',
        ['better_lit'],
        longer.pieces,
        fastest.metrics.durationS,
        betterLitRationale(fastest.metrics, longer.metrics, longer.judgement.extraS),
        true,
      );
      route.warnings.unshift(`Longer than your ${prefs.maxDetourMin}-minute limit. Shown because "Show longer alternatives" is on.`);
      routes.push(route);
    }
  }
  const recommendedId =
    prefs.mode === 'better_lit' ? (routes.find((r) => r.roles.includes('better_lit') && !r.overCap)?.id ?? 'fastest') : 'fastest';
  return { routes, notices, recommendedId, searches: profiles.length, distinct: evaluated.length };
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

/* ---------------------------------------------------------------------------------- easier */

interface EasierEval {
  pieces: RoutePiece[];
  signature: string;
  extraS: number;
  access: AccessibilitySummary;
  stepsAvoided: number;
  reductionM: number;
  utility: number;
  qualifies: boolean;
  overCap: boolean;
}

function planEasier(ctx: Context): ModeResult {
  const { engine, prefs, fastest } = ctx;
  const cfg = engine.config;
  const acfg = cfg.accessibility;
  const fastestAccess = fastest.accessibility;
  const fastestSig = routeSignature(fastest.pieces);
  const evals = new Map<string, EasierEval>();
  for (const exponent of acfg.easierExponents) {
    const found = engine.route(
      ctx.origin,
      ctx.destination,
      makeCost({
        speedMps: cfg.walkingSpeedMps,
        exclude: ctx.exclude,
        segmentMultiplier: (seg) => Math.min(acfg.maxSegmentMultiplier, effortMultiplier(seg, { includeSteps: true, includeIncline: true }) ** exponent),
      }),
    );
    if (!found) continue;
    const signature = routeSignature(found.pieces);
    if (signature === fastestSig || evals.has(signature)) continue;
    const { metrics } = engine.describe(found.pieces);
    const access = computeAccessibility(engine.graph, found.pieces);
    const extraS = Math.max(0, metrics.durationS - fastest.metrics.durationS);
    const stepsAvoided = fastestAccess.steps.flights - access.steps.flights;
    const reductionM = fastestAccess.difficultM - access.difficultM;
    const improves = (stepsAvoided > 0 || reductionM >= acfg.easier.minDifficultReductionM) && stepsAvoided >= 0 && reductionM >= 0;
    evals.set(signature, {
      pieces: found.pieces,
      signature,
      extraS,
      access,
      stepsAvoided,
      reductionM,
      utility: reductionM + 40 * stepsAvoided - acfg.easier.timeCostMPerMin * (extraS / 60),
      qualifies: improves && extraS <= ctx.maxExtraS + 1e-9,
      overCap: improves && extraS > ctx.maxExtraS + 1e-9,
    });
  }
  const all = [...evals.values()];
  const rank = (a: EasierEval, b: EasierEval) =>
    b.utility - a.utility || a.extraS - b.extraS || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
  const best = all.filter((e) => e.qualifies).sort(rank)[0];
  const longer = all.filter((e) => e.overCap).sort(rank)[0];
  const routes: RouteCandidate[] = [fastest];
  const notices: PlanNotice[] = [];

  if (best) {
    routes.push(engine.buildRoute('easier', ['easier'], best.pieces, fastest.metrics.durationS, easierRationale(fastestAccess, best.access, best.extraS)));
  } else {
    if (fastestAccess.difficultM < 1 && fastestAccess.steps.flights === 0) {
      fastest.roles.push('easier');
      notices.push({
        id: 'easier-already',
        tone: 'info',
        title: 'The fastest route is also the easiest we can identify',
        message: 'It has no mapped steps, rough surfaces, steep incline tags or wheelchair restrictions. Gradient information is unavailable, and unmapped surfaces cannot be assessed.',
      });
    } else if (longer) {
      notices.push({
        id: 'easier-over-cap',
        tone: 'info',
        title: 'Easier route is longer than your limit',
        message: `An easier route adds about ${Math.round(longer.extraS / 60)} min, more than your ${prefs.maxDetourMin}-minute limit.${prefs.showLongerAlternatives ? ' It is shown with a warning.' : ' Raise the limit or turn on "Show longer alternatives" to see it.'}`,
      });
      if (prefs.showLongerAlternatives) {
        const r = engine.buildRoute('easier_longer', ['easier'], longer.pieces, fastest.metrics.durationS, easierRationale(fastestAccess, longer.access, longer.extraS), true);
        r.warnings.unshift(`Longer than your ${prefs.maxDetourMin}-minute limit. Shown because "Show longer alternatives" is on.`);
        routes.push(r);
      }
    } else {
      notices.push({
        id: 'easier-none',
        tone: 'info',
        title: 'No easier alternative found',
        message: 'No route with fewer mapped steps or difficult surfaces was found within your limit. The fastest route\'s difficult sections are listed below.',
      });
    }
  }
  const recommendedId = routes.find((r) => r.roles.includes('easier') && !r.overCap)?.id ?? 'fastest';
  return { routes, notices, recommendedId, searches: acfg.easierExponents.length, distinct: all.length };
}

/* ------------------------------------------------------------------------------- step-free */

function planStepFree(ctx: Context): ModeResult {
  const { engine, prefs, fastest } = ctx;
  const cfg = engine.config;
  const graph = engine.graph;
  const nodeAllowed = (n: number) => nodeStepFreeBlock(graph.nodes[n]!) === null;
  const found = engine.route(
    ctx.origin,
    ctx.destination,
    makeCost({
      speedMps: cfg.walkingSpeedMps,
      exclude: (seg) => ctx.exclude(seg) || segmentStepFreeBlock(seg) !== null,
      // Prefer avoiding stretches tagged steep in OSM where an alternative exists (not an exclusion).
      segmentMultiplier: (seg) => inclineOnlyMultiplier(seg) * (ctx.surfaceFactor ? ctx.surfaceFactor(seg) : 1),
    }),
    nodeAllowed,
  );
  const notices: PlanNotice[] = [];
  if (!found) {
    notices.push({
      id: 'step-free-none',
      tone: 'warning',
      title: 'No verified step-free route',
      message:
        'Every connection between these points in the mapped network uses mapped steps, a mapped barrier or kerb, or a path tagged wheelchair=no. The fastest route is shown for reference only and is not step-free.',
    });
    fastest.warnings.unshift('Not step-free: this route uses at least one mapped step, barrier or wheelchair=no path, or none exists.');
    return { routes: [fastest], notices, recommendedId: 'fastest', searches: 1, distinct: 0 };
  }

  const sameAsFastest = routeSignature(found.pieces) === routeSignature(fastest.pieces);
  if (sameAsFastest && fastest.accessibility.stepFreeBlockers.length === 0) {
    fastest.roles.push('step_free');
    fastest.warnings.unshift(...stepFreeCaveats(fastest.accessibility));
    return { routes: [fastest], notices, recommendedId: 'fastest', searches: 1, distinct: 0 };
  }

  const extraS = Math.max(0, engine.describe(found.pieces).metrics.durationS - fastest.metrics.durationS);
  const overCap = extraS > ctx.maxExtraS + 1e-9;
  const stepFree = engine.buildRoute(
    'step_free',
    ['step_free'],
    found.pieces,
    fastest.metrics.durationS,
    stepFreeRationale(fastest.accessibility, extraS),
    overCap,
  );
  stepFree.warnings.unshift(...stepFreeCaveats(stepFree.accessibility));
  if (overCap) {
    // A hard requirement, not an optional detour: shown, but never silently.
    stepFree.warnings.unshift(
      `About ${Math.round(extraS / 60)} min longer than the fastest route, beyond your ${prefs.maxDetourMin}-minute limit. Shown because it is the only route found that avoids mapped steps and barriers.`,
    );
  }
  if (fastest.accessibility.stepFreeBlockers.length > 0) {
    fastest.warnings.unshift(`Not step-free: ${summariseBlockers(fastest.accessibility.stepFreeBlockers)}.`);
  }
  return { routes: [fastest, stepFree], notices, recommendedId: 'step_free', searches: 1, distinct: 1 };
}

export function summariseBlockers(blockers: { reason: string }[]): string {
  const counts = new Map<string, number>();
  for (const b of blockers) counts.set(b.reason, (counts.get(b.reason) ?? 0) + 1);
  return [...counts]
    .map(([reason, n]) => {
      if (reason === 'mapped steps') return n === 1 ? '1 set of mapped steps' : `${n} sets of mapped steps`;
      if (reason === 'mapped wheelchair=no') return n === 1 ? '1 path tagged wheelchair=no' : `${n} paths tagged wheelchair=no`;
      return n > 1 ? `${n} × ${reason}` : reason;
    })
    .join(', ');
}

/** What a step-free route still cannot promise, from the data on the route itself. */
export function stepFreeCaveats(a: AccessibilitySummary): string[] {
  const gaps: string[] = ['gradient information is unavailable'];
  if (a.crossings.kerbUnknown > 0) gaps.push(`${a.crossings.kerbUnknown} of ${a.crossings.total} crossings have no kerb information`);
  if (a.kerbs.unknown > 0) gaps.push(`${a.kerbs.unknown} mapped kerbs have no height or type`);
  const unknownSurfacePct = a.totalM > 0 ? Math.round((a.surface.unknown / a.totalM) * 100) : 0;
  if (unknownSurfacePct >= 5) gaps.push(`surface is unmapped on ${unknownSurfacePct}% of it`);
  const widthUnknownPct = a.totalM > 0 ? Math.round(((a.totalM - a.widthKnownM) / a.totalM) * 100) : 0;
  if (widthUnknownPct >= 5) gaps.push(`path width is unmapped on ${widthUnknownPct}% of it`);
  const gates = a.barriers.gate ?? 0;
  if (gates > 0) gaps.push(`it passes ${gates} mapped gate${gates === 1 ? '' : 's'}, which may be closed`);
  return [`Avoids all mapped steps, mapped barriers and paths tagged wheelchair=no, but it is not verified as wheelchair accessible: ${gaps.join('; ')}.`];
}
