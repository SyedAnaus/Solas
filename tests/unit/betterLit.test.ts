import { describe, expect, it } from 'vitest';
import { ROUTING_CONFIG } from '../../src/config/routing';
import { haversineM, polylineLengthM } from '../../src/lib/graph/geo';
import { parseGraph } from '../../src/lib/graph/parse';
import type { GraphFile } from '../../src/lib/graph/types';
import { dedupeRoutes, routeOverlap, routeSignature } from '../../src/lib/routing/candidates';
import { RoutingEngine } from '../../src/lib/routing/engine';
import { compareCandidates, planRoutes } from '../../src/lib/routing/planner';
import { DEFAULT_PREFERENCES, type RoutePreferences } from '../../src/lib/routing/preferences';
import { mergeStretches, routeEvidence, summariseProvenance } from '../../src/lib/scoring/evidence';
import { assessLighting, judgeBetterLit, type LightingAssessment } from '../../src/lib/scoring/lightingScore';
import type { LightingBreakdown } from '../../src/lib/scoring/metrics';
import { buildSyntheticGraphFile, NODES } from '../fixtures/syntheticGraph';

const engine = new RoutingEngine(parseGraph(buildSyntheticGraphFile()));
const prefs = (p: Partial<RoutePreferences> = {}): RoutePreferences => ({ ...DEFAULT_PREFERENCES, ...p });

function plan(p: Partial<RoutePreferences> = {}, e = engine, from = NODES.A, to = NODES.C) {
  const r = planRoutes(e, from, to, prefs(p));
  if (!r.ok) throw new Error(`expected a plan, got ${r.error.kind}`);
  return r;
}

function breakdown(pct: { mapped_lit: number; likely_lit: number; mapped_unlit: number; unknown: number }): LightingBreakdown {
  return { metres: pct, exactPercent: pct, roundedPercent: pct };
}
const assess = (pct: Parameters<typeof breakdown>[0]): LightingAssessment => assessLighting(breakdown(pct));

describe('lighting assessment math', () => {
  it('headline combines only mapped and likely lit, and unknown is not counted as dark', () => {
    const a = assess({ mapped_lit: 30, likely_lit: 30, mapped_unlit: 0, unknown: 40 });
    expect(a.litEvidencePct).toBe(60);
    expect(a.evidenceCoveragePct).toBe(60);
    expect(a.score).toBeCloseTo(30 + ROUTING_CONFIG.lighting.likelyWeight * 30, 9);
    const unknownOnly = assess({ mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 100 });
    const unlitOnly = assess({ mapped_lit: 0, likely_lit: 0, mapped_unlit: 100, unknown: 0 });
    expect(unknownOnly.score).toBe(0);
    expect(unlitOnly.score).toBeLessThan(unknownOnly.score);
  });

  it('applies the 10-point threshold exactly at the boundary', () => {
    const fastest = { assessment: assess({ mapped_lit: 40, likely_lit: 0, mapped_unlit: 0, unknown: 60 }), durationS: 600 };
    const at = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 50, likely_lit: 0, mapped_unlit: 0, unknown: 50 }), durationS: 700 }, 600);
    const below = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 49.9, likely_lit: 0, mapped_unlit: 0, unknown: 50.1 }), durationS: 700 }, 600);
    expect(at.qualifies).toBe(true);
    expect(at.gainPts).toBeCloseTo(10, 9);
    expect(below.qualifies).toBe(false);
    expect(below.rejections).toContain('below-threshold');
  });

  it('rejects sparse evidence, added unlit length and over-cap detours', () => {
    const fastest = { assessment: assess({ mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 100 }), durationS: 600 };
    const sparse = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 30, likely_lit: 0, mapped_unlit: 0, unknown: 70 }), durationS: 650 }, 600);
    expect(sparse.rejections).toEqual(['too-sparse']);
    const unlit = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 60, likely_lit: 0, mapped_unlit: 5, unknown: 35 }), durationS: 650 }, 600);
    expect(unlit.rejections).toContain('more-unlit');
    const long = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 90, likely_lit: 0, mapped_unlit: 0, unknown: 10 }), durationS: 600 + 11 * 60 }, 10 * 60);
    expect(long.rejections).toEqual(['over-cap']);
    expect(long.extraS).toBe(660);
  });

  it('ranks by lighting gain net of extra time', () => {
    const fastest = { assessment: assess({ mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 100 }), durationS: 600 };
    const quick = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 70, likely_lit: 0, mapped_unlit: 0, unknown: 30 }), durationS: 660 }, 900);
    const slow = judgeBetterLit(fastest, { assessment: assess({ mapped_lit: 75, likely_lit: 0, mapped_unlit: 0, unknown: 25 }), durationS: 1200 }, 900);
    expect(quick.utility).toBeCloseTo(70 - 1.5 * 1, 9);
    expect(slow.utility).toBeCloseTo(75 - 1.5 * 10, 9);
    expect(quick.utility).toBeGreaterThan(slow.utility);
  });
});

describe('tie-breaking and deduplication', () => {
  const base = { pieces: [], source: 's', order: 0, metrics: {} as never };
  const make = (signature: string, utility: number, extraS: number, unknownPct: number) =>
    ({
      ...base,
      signature,
      assessment: { ...assess({ mapped_lit: 50, likely_lit: 0, mapped_unlit: 0, unknown: 50 }), unknownPct },
      judgement: { gainPts: 20, scoreGain: 20, extraS, utility, qualifies: true, rejections: [] },
    }) as Parameters<typeof compareCandidates>[0];

  it('orders by utility, then extra time, then unknown share, then path signature', () => {
    const items = [make('9f', 10, 60, 20), make('1f', 10, 60, 20), make('5f', 10, 30, 40), make('3f', 12, 300, 50), make('2f', 10, 60, 10)];
    expect(items.sort(compareCandidates).map((i) => i.signature)).toEqual(['3f', '5f', '2f', '1f', '9f']);
  });

  it('measures overlap on real segment metres', () => {
    const r = plan();
    const [fastest, better] = r.routes;
    expect(routeOverlap(engine.graph, fastest!.pieces, fastest!.pieces)).toBeCloseTo(1, 9);
    expect(routeOverlap(engine.graph, fastest!.pieces, better!.pieces)).toBe(0);
    const { kept, duplicates } = dedupeRoutes(engine.graph, [{ pieces: fastest!.pieces }, { pieces: [...fastest!.pieces] }, { pieces: better!.pieces }], 0.9);
    expect(kept).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
    expect(routeSignature(fastest!.pieces)).not.toBe(routeSignature(better!.pieces));
  });

  it('is deterministic for identical inputs', () => {
    const a = plan();
    const b = plan();
    expect(a.routes.map((r) => routeSignature(r.pieces))).toEqual(b.routes.map((r) => routeSignature(r.pieces)));
  });
});

describe('planRoutes: better-lit alternative', () => {
  it('offers a distinct, better-lit route within the cap with honest numbers', () => {
    const r = plan();
    expect(r.routes.map((x) => x.id)).toEqual(['fastest', 'better_lit']);
    const [fastest, better] = r.routes as [(typeof r.routes)[0], (typeof r.routes)[0]];
    expect(r.recommendedId).toBe('better_lit');
    expect(fastest.lighting.litEvidencePct).toBe(0);
    expect(fastest.lighting.mappedUnlitPct).toBeCloseTo(50, 1);
    expect(better.lighting.litEvidencePct).toBeGreaterThan(85);
    expect(better.extraS).toBeCloseTo((better.metrics.distanceM - fastest.metrics.distanceM) / ROUTING_CONFIG.walkingSpeedMps, 6);
    expect(better.extraS / 60).toBeGreaterThan(3);
    expect(better.extraS / 60).toBeLessThan(4);
    expect(better.rationale).toMatch(/\+3 min for more lighting evidence: 0% → 9\d% mapped or likely lit/);
    expect(r.notices).toEqual([]);
  });

  it('hides alternatives beyond the detour cap and explains why', () => {
    const r = plan({ maxDetourMin: 3 });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest']);
    expect(r.recommendedId).toBe('fastest');
    expect(r.notices[0]).toMatchObject({ id: 'better-lit-over-cap' });
    expect(r.notices[0]!.message).toMatch(/adds about 3 min, more than your 3-minute limit/);
  });

  it('shows a longer alternative only on request, flagged and never recommended', () => {
    const r = plan({ maxDetourMin: 3, showLongerAlternatives: true });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest', 'better_lit_longer']);
    const longer = r.routes[1]!;
    expect(longer.overCap).toBe(true);
    expect(longer.warnings[0]).toMatch(/Longer than your 3-minute limit/);
    expect(r.recommendedId).toBe('fastest');
  });

  it('does not invent an alternative when the fastest route is already the best lit', () => {
    const r = plan({}, engine, NODES.D, NODES.E);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]!.roles).toEqual(['fastest', 'better_lit']);
    expect(r.notices[0]).toMatchObject({ id: 'better-lit-same-route' });
  });

  it('does not claim improvement when the data is too sparse', () => {
    const file = buildSyntheticGraphFile() as GraphFile;
    file.edges[0]!.light = [[0, 1, 'mapped_unlit']]; // A-B
    for (const id of [3, 4, 5]) file.edges[id]!.light = [[0, 1, 'unknown']]; // most of the detour
    const sparse = new RoutingEngine(parseGraph(file));
    const r = plan({ lightingEmphasis: 'strong' }, sparse);
    expect(r.routes.map((x) => x.id)).toEqual(['fastest']);
    expect(r.notices[0]).toMatchObject({ id: 'better-lit-sparse' });
  });

  it('treats an all-unknown network as no evidence, not as darkness', () => {
    const file = buildSyntheticGraphFile() as GraphFile;
    for (const e of file.edges) e.light = [[0, 1, 'unknown']];
    const blank = new RoutingEngine(parseGraph(file));
    const r = plan({}, blank);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]!.metrics.distanceM).toBeCloseTo(200, 0);
    expect(r.routes[0]!.lighting.unknownPct).toBeCloseTo(100, 6);
    expect(r.routes[0]!.warnings[0]).toMatch(/100% of this route has no lighting information/);
    expect(r.notices[0]!.id).toBe('better-lit-same-route');
  });

  it('lighting emphasis changes which penalties are searched', () => {
    expect(plan({ lightingEmphasis: 'gentle' }).stats.searches).toBe(1 + ROUTING_CONFIG.lighting.penaltyProfiles.gentle.length);
    expect(plan({ lightingEmphasis: 'strong' }).stats.searches).toBe(1 + ROUTING_CONFIG.lighting.penaltyProfiles.strong.length);
  });
});

describe('evidence stretches follow the real path geometry', () => {
  it('cover the whole route, connect end to end, and carry provenance', () => {
    const r = plan();
    for (const route of r.routes) {
      const stretches = routeEvidence(engine.graph, route.pieces);
      const total = stretches.reduce((s, x) => s + x.metres, 0);
      expect(total).toBeCloseTo(route.metrics.distanceM, 6);
      expect(haversineM(stretches[0]!.coords[0]!, route.geometry.coordinates[0]!)).toBeLessThan(0.01);
      for (let i = 1; i < stretches.length; i++) {
        expect(haversineM(stretches[i - 1]!.coords.at(-1)!, stretches[i]!.coords[0]!)).toBeLessThan(0.01);
      }
      for (const s of stretches) expect(polylineLengthM(s.coords)).toBeCloseTo(s.metres, 0);
      const merged = mergeStretches(stretches);
      expect(merged.reduce((s, x) => s + x.metres, 0)).toBeCloseTo(total, 6);
      const prov = summariseProvenance(stretches);
      for (const cls of ['mapped_lit', 'likely_lit', 'mapped_unlit', 'unknown'] as const) {
        expect(prov[cls].metres).toBeCloseTo(route.metrics.lighting.metres[cls], 6);
      }
    }
    const better = summariseProvenance(r.routes[1]!.evidence);
    expect(better.likely_lit.lamps).toEqual([9001]);
    expect(better.mapped_lit.ways).toEqual([1002, 1003, 1005]);
    expect(better.mapped_lit.litTagValues['lit=yes']).toBeGreaterThan(0);
  });
});
