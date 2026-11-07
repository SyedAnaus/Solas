import { ROUTING_CONFIG } from '../../config/routing';
import { pieceLengthM } from '../graph/route';
import type { RoutePiece } from '../graph/search';
import type { PedestrianGraph, PedestrianNode, Segment, TagValue } from '../graph/types';

type AccessConfig = typeof ROUTING_CONFIG.accessibility;
const CFG = ROUTING_CONFIG.accessibility;

export type SurfaceClass = 'smooth' | 'moderate' | 'rough' | 'unknown';
export type InclineClass = 'steep' | 'moderate' | 'gentle' | 'direction-only' | 'unknown';

/** Single tag value, or null when absent or when merged ways disagree. */
function one(value: TagValue | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.length === 1 ? value[0]! : null;
  return value;
}

function anyEquals(value: TagValue | undefined, target: string): boolean {
  if (value === undefined) return false;
  return Array.isArray(value) ? value.includes(target) : value === target;
}

export function surfaceClass(seg: Segment, cfg: AccessConfig = CFG): SurfaceClass {
  const s = one(seg.tags.surface);
  if (!s) return 'unknown';
  if ((cfg.surfaceClasses.rough as readonly string[]).includes(s)) return 'rough';
  if ((cfg.surfaceClasses.moderate as readonly string[]).includes(s)) return 'moderate';
  if ((cfg.surfaceClasses.smooth as readonly string[]).includes(s)) return 'smooth';
  return 'unknown';
}

/**
 * Absolute incline in percent from an OSM `incline` tag, or null if it is not numeric.
 * Accepts "10%", "-5 %", "12.28" (percent assumed) and degrees ("5°").
 */
export function parseInclinePct(value: string | null): number | null {
  if (!value) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(%|°)?\s*$/.exec(value);
  if (!m) return null;
  const n = Math.abs(Number(m[1]));
  if (!Number.isFinite(n)) return null;
  return m[2] === '°' ? Math.tan((n * Math.PI) / 180) * 100 : n;
}

/** Qualitative class only: these are contributor estimates, not measured gradients. */
export function inclineClass(seg: Segment, cfg: AccessConfig = CFG): InclineClass {
  const raw = one(seg.tags.incline);
  if (!raw) return 'unknown';
  const pct = parseInclinePct(raw);
  if (pct === null) return ['up', 'down', 'yes'].includes(raw) ? 'direction-only' : 'unknown';
  if (pct >= cfg.steepInclinePct) return 'steep';
  if (pct >= cfg.moderateInclinePct) return 'moderate';
  return 'gentle';
}

export function isSteps(seg: Segment): boolean {
  if (anyEquals(seg.tags.highway, 'steps')) return true;
  const count = Number(one(seg.tags.step_count));
  return Number.isFinite(count) && count > 0;
}

/** Kerb height in metres from `kerb:height` ("0.04", "4 cm", "40 mm"), or null. */
export function kerbHeightM(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)?\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'cm' ? n / 100 : m[2] === 'mm' ? n / 1000 : n;
}

/** Why a segment is closed to step-free routing, or null if no mapped blocker. */
export function segmentStepFreeBlock(seg: Segment): string | null {
  if (isSteps(seg)) return 'mapped steps';
  if (anyEquals(seg.tags.wheelchair, 'no')) return 'mapped wheelchair=no';
  if (anyEquals(seg.tags.kerb, 'raised')) return 'mapped raised kerb';
  return null;
}

/** Why a node is closed to step-free routing, or null if no mapped blocker. */
export function nodeStepFreeBlock(node: PedestrianNode, cfg: AccessConfig = CFG): string | null {
  const t = node.tags;
  if (!t) return null;
  if (t.wheelchair === 'no') return 'mapped wheelchair=no';
  if (t.barrier && (cfg.stepFree.blockedBarriers as readonly string[]).includes(t.barrier)) return `mapped ${t.barrier.replace(/_/g, ' ')}`;
  if (t.kerb && (cfg.stepFree.blockedKerbs as readonly string[]).includes(t.kerb)) return 'mapped raised kerb';
  const h = kerbHeightM(t['kerb:height']);
  if (h !== null && h > cfg.stepFree.maxKerbHeightM) return `mapped kerb ${Math.round(h * 100)} cm high`;
  return null;
}

/**
 * Effort multiplier (>= 1) for easier walking: steps, rough or bad surfaces and steep tags cost
 * more. Unknown attributes get at most a small uncertainty penalty.
 */
export function effortMultiplier(seg: Segment, opts: { includeSteps: boolean; includeIncline: boolean }, cfg: AccessConfig = CFG): number {
  let m = cfg.surfaceMultiplier[surfaceClass(seg, cfg)];
  const smooth = one(seg.tags.smoothness);
  if (smooth && cfg.smoothnessMultiplier[smooth] !== undefined) m *= cfg.smoothnessMultiplier[smooth]!;
  if (opts.includeIncline) {
    const inc = inclineClass(seg, cfg);
    if (inc === 'steep') m *= cfg.inclineMultiplier.steep;
    else if (inc === 'moderate') m *= cfg.inclineMultiplier.moderate;
    else if (inc === 'direction-only') m *= cfg.inclineMultiplier.directionOnly;
  }
  if (opts.includeSteps && isSteps(seg)) m *= cfg.stepsMultiplier;
  if (anyEquals(seg.tags.wheelchair, 'limited')) m *= cfg.wheelchairLimitedMultiplier;
  return Math.min(cfg.maxSegmentMultiplier, Math.max(1, m));
}

/**
 * Penalty for stretches OSM contributors tagged as steep or moderately steep (>= 1). Used by
 * step-free routing; direction-only tags ("up") carry no magnitude and are not penalised.
 */
export function inclineOnlyMultiplier(seg: Segment, cfg: AccessConfig = CFG): number {
  const inc = inclineClass(seg, cfg);
  if (inc === 'steep') return cfg.inclineMultiplier.steep;
  if (inc === 'moderate') return cfg.inclineMultiplier.moderate;
  return 1;
}

/** Surface-only multiplier for "prefer smoother surfaces". */
export function surfaceOnlyMultiplier(seg: Segment, cfg: AccessConfig = CFG): number {
  return effortMultiplier(seg, { includeSteps: false, includeIncline: false }, cfg);
}

/** A mapped feature that closes a path to step-free travel, with its OSM source. */
export interface StepFreeBlocker {
  /** Stable key, e.g. "steps:0", "way:123:wheelchair", "node:456". */
  key: string;
  reason: string;
  /** OSM reference such as "way/123" or "node/456" (first way for a set of steps). */
  osm?: string;
}

export interface AccessibilitySummary {
  /** `flights` counts sets of steps: consecutive step segments, joining landings under 10 m. */
  steps: { flights: number; metres: number; stepCount: number | null };
  surface: Record<SurfaceClass, number>;
  /** Surface values seen on rough stretches, with metres. */
  roughSurfaces: Record<string, number>;
  badSmoothnessM: number;
  /** Qualitative slope tags only. No gradient figures are ever derived. */
  slope: { steepTaggedM: number; moderateTaggedM: number; directionOnlyM: number; untaggedM: number };
  wheelchair: { yesM: number; limitedM: number; noM: number; untaggedM: number };
  widthKnownM: number;
  crossings: { total: number; kerbKnown: number; kerbUnknown: number };
  kerbs: { lowered: number; raised: number; unknown: number };
  barriers: Record<string, number>;
  /** Mapped blockers that a step-free route must not pass, one entry per feature. */
  stepFreeBlockers: StepFreeBlocker[];
  /** Metres with at least one mapped difficulty (steps, rough, bad smoothness, steep tag, wheelchair=limited/no). */
  difficultM: number;
  totalM: number;
}

const LOWERED_KERBS = new Set(['lowered', 'flush', 'no', 'rolled']);
/** Step segments separated by less than this (a landing) count as one set of steps. */
const STAIR_LANDING_MAX_M = 10;

function isCrossingSegment(seg: Segment): boolean {
  return anyEquals(seg.tags.footway, 'crossing') || anyEquals(seg.tags.highway, 'crossing') || seg.tags.crossing !== undefined;
}

function hasKerbInfo(node: PedestrianNode | undefined): boolean {
  return Boolean(node?.tags && (node.tags.kerb !== undefined || node.tags['kerb:height'] !== undefined));
}

/** Nodes walked through, in order (the joins between pieces). */
export function routeNodes(graph: PedestrianGraph, pieces: RoutePiece[]): number[] {
  const nodes: number[] = [];
  for (let i = 0; i < pieces.length - 1; i++) {
    const p = pieces[i]!;
    const seg = graph.segments[p.segment]!;
    nodes.push(p.reversed ? seg.u : seg.v);
  }
  return nodes;
}

export function computeAccessibility(graph: PedestrianGraph, pieces: RoutePiece[], cfg: AccessConfig = CFG): AccessibilitySummary {
  const out: AccessibilitySummary = {
    steps: { flights: 0, metres: 0, stepCount: 0 },
    surface: { smooth: 0, moderate: 0, rough: 0, unknown: 0 },
    roughSurfaces: {},
    badSmoothnessM: 0,
    slope: { steepTaggedM: 0, moderateTaggedM: 0, directionOnlyM: 0, untaggedM: 0 },
    wheelchair: { yesM: 0, limitedM: 0, noM: 0, untaggedM: 0 },
    widthKnownM: 0,
    crossings: { total: 0, kerbKnown: 0, kerbUnknown: 0 },
    kerbs: { lowered: 0, raised: 0, unknown: 0 },
    barriers: {},
    stepFreeBlockers: [],
    difficultM: 0,
    totalM: 0,
  };
  const stepSegments = new Set<number>();
  let stepCountKnown = true;
  const crossingSegments = new Set<number>();
  const crossingNodes = new Set<number>();
  const blockers = new Map<string, StepFreeBlocker>();
  let flights = 0;
  let gapSinceStepsM = Infinity;

  for (const piece of pieces) {
    const seg = graph.segments[piece.segment]!;
    const len = pieceLengthM(graph, piece);
    out.totalM += len;
    let difficult = false;

    if (isSteps(seg)) {
      difficult = true;
      out.steps.metres += len;
      if (gapSinceStepsM >= STAIR_LANDING_MAX_M) {
        flights += 1;
        const key = `steps:${flights}`;
        blockers.set(key, { key, reason: 'mapped steps', ...(seg.ways[0] ? { osm: `way/${seg.ways[0]}` } : {}) });
      }
      gapSinceStepsM = 0;
      if (!stepSegments.has(seg.id)) {
        stepSegments.add(seg.id);
        const c = Number(one(seg.tags.step_count));
        if (Number.isFinite(c) && c > 0) out.steps.stepCount! += c;
        else stepCountKnown = false;
      }
    } else {
      gapSinceStepsM += len;
    }
    const sc = surfaceClass(seg, cfg);
    out.surface[sc] += len;
    if (sc === 'rough') {
      difficult = true;
      const name = one(seg.tags.surface) ?? 'rough';
      out.roughSurfaces[name] = (out.roughSurfaces[name] ?? 0) + len;
    }
    const smooth = one(seg.tags.smoothness);
    if (smooth && (cfg.smoothnessMultiplier[smooth] ?? 1) >= 1.5) {
      difficult = true;
      out.badSmoothnessM += len;
    }
    const inc = inclineClass(seg, cfg);
    if (inc === 'steep') {
      difficult = true;
      out.slope.steepTaggedM += len;
    } else if (inc === 'moderate') out.slope.moderateTaggedM += len;
    else if (inc === 'direction-only') out.slope.directionOnlyM += len;
    else if (inc === 'unknown') out.slope.untaggedM += len;

    const wc = one(seg.tags.wheelchair);
    if (wc === 'yes' || wc === 'designated') out.wheelchair.yesM += len;
    else if (wc === 'limited') {
      out.wheelchair.limitedM += len;
      difficult = true;
    } else if (wc === 'no') {
      out.wheelchair.noM += len;
      difficult = true;
    } else out.wheelchair.untaggedM += len;

    if (seg.tags.width !== undefined || seg.tags.est_width !== undefined) out.widthKnownM += len;
    if (difficult) out.difficultM += len;

    if (isCrossingSegment(seg) && !crossingSegments.has(seg.id)) {
      crossingSegments.add(seg.id);
      const known = hasKerbInfo(graph.nodes[seg.u]) || hasKerbInfo(graph.nodes[seg.v]) || seg.tags.kerb !== undefined;
      out.crossings.total += 1;
      if (known) out.crossings.kerbKnown += 1;
      else out.crossings.kerbUnknown += 1;
      crossingNodes.add(seg.u);
      crossingNodes.add(seg.v);
    }
    const block = segmentStepFreeBlock(seg);
    if (block && block !== 'mapped steps') {
      const key = `way:${seg.ways.join(',')}:${block}`;
      if (!blockers.has(key)) blockers.set(key, { key, reason: block, ...(seg.ways[0] ? { osm: `way/${seg.ways[0]}` } : {}) });
    }
  }
  out.steps.flights = flights;
  if (!stepCountKnown || out.steps.flights === 0) out.steps.stepCount = out.steps.flights === 0 ? 0 : null;

  for (const n of routeNodes(graph, pieces)) {
    const node = graph.nodes[n]!;
    const t = node.tags;
    if (!t) continue;
    if (t.highway === 'crossing' && !crossingNodes.has(n)) {
      out.crossings.total += 1;
      if (hasKerbInfo(node)) out.crossings.kerbKnown += 1;
      else out.crossings.kerbUnknown += 1;
    }
    if (t.barrier === 'kerb' || t.kerb !== undefined || t['kerb:height'] !== undefined) {
      const h = kerbHeightM(t['kerb:height']);
      if (t.kerb === 'raised' || (h !== null && h > cfg.stepFree.maxKerbHeightM)) out.kerbs.raised += 1;
      else if ((t.kerb && LOWERED_KERBS.has(t.kerb)) || (h !== null && h <= cfg.stepFree.maxKerbHeightM)) out.kerbs.lowered += 1;
      else out.kerbs.unknown += 1;
    }
    if (t.barrier && t.barrier !== 'kerb') out.barriers[t.barrier] = (out.barriers[t.barrier] ?? 0) + 1;
    const block = nodeStepFreeBlock(node, cfg);
    if (block) blockers.set(`node:${node.osmId}`, { key: `node:${node.osmId}`, reason: block, osm: `node/${node.osmId}` });
  }
  out.stepFreeBlockers = [...blockers.values()];
  return out;
}
