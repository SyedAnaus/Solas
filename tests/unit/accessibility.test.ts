import { describe, expect, it } from 'vitest';
import { haversineM } from '../../src/lib/graph/geo';
import { parseGraph } from '../../src/lib/graph/parse';
import type { GraphFile, LngLat, Segment } from '../../src/lib/graph/types';
import { RoutingEngine } from '../../src/lib/routing/engine';
import { planRoutes } from '../../src/lib/routing/planner';
import { DEFAULT_PREFERENCES, type RoutePreferences } from '../../src/lib/routing/preferences';
import {
  computeAccessibility,
  effortMultiplier,
  inclineClass,
  kerbHeightM,
  nodeStepFreeBlock,
  parseInclinePct,
  segmentStepFreeBlock,
  surfaceClass,
} from '../../src/lib/scoring/accessibility';
import { buildSyntheticGraphFile, idx, NODES, P } from '../fixtures/syntheticGraph';

const prefs = (p: Partial<RoutePreferences> = {}): RoutePreferences => ({ ...DEFAULT_PREFERENCES, ...p });

function engineWith(mod: (f: GraphFile) => void = () => {}): RoutingEngine {
  const f = buildSyntheticGraphFile();
  mod(f);
  return new RoutingEngine(parseGraph(f));
}

function plan(engine: RoutingEngine, from: LngLat, to: LngLat, p: Partial<RoutePreferences>) {
  const r = planRoutes(engine, from, to, prefs(p));
  if (!r.ok) throw new Error(`expected a plan, got ${r.error.kind}`);
  return r;
}

const seg = (tags: Record<string, string>): Segment =>
  ({ id: 0, u: 0, v: 1, length: 10, coords: [], cumulative: new Float64Array(), tags, light: [], lamps: [], ways: [1], forwardAllowed: true, backwardAllowed: true }) as Segment;

describe('tag classifiers', () => {
  it('parses OSM incline values without inventing figures', () => {
    expect(parseInclinePct('10%')).toBe(10);
    expect(parseInclinePct('-5 %')).toBe(5);
    expect(parseInclinePct('12.28')).toBeCloseTo(12.28);
    expect(parseInclinePct('5°')).toBeCloseTo(8.75, 1);
    expect(parseInclinePct('up')).toBeNull();
    expect(parseInclinePct(null)).toBeNull();
    expect(inclineClass(seg({ incline: '9%' }))).toBe('steep');
    expect(inclineClass(seg({ incline: '6%' }))).toBe('moderate');
    expect(inclineClass(seg({ incline: '2%' }))).toBe('gentle');
    expect(inclineClass(seg({ incline: 'up' }))).toBe('direction-only');
    expect(inclineClass(seg({}))).toBe('unknown');
  });

  it('classifies surfaces and keeps unknown separate from rough', () => {
    expect(surfaceClass(seg({ surface: 'asphalt' }))).toBe('smooth');
    expect(surfaceClass(seg({ surface: 'fine_gravel' }))).toBe('moderate');
    expect(surfaceClass(seg({ surface: 'sett' }))).toBe('rough');
    expect(surfaceClass(seg({}))).toBe('unknown');
    expect(surfaceClass(seg({ surface: 'something_new' }))).toBe('unknown');
  });

  it('reads kerb heights in m, cm and mm', () => {
    expect(kerbHeightM('0.04')).toBe(0.04);
    expect(kerbHeightM('4 cm')).toBeCloseTo(0.04);
    expect(kerbHeightM('40 mm')).toBeCloseTo(0.04);
    expect(kerbHeightM('high')).toBeNull();
  });

  it('identifies confirmed step-free blockers only', () => {
    expect(segmentStepFreeBlock(seg({ highway: 'steps' }))).toBe('mapped steps');
    expect(segmentStepFreeBlock(seg({ highway: 'footway', step_count: '3' }))).toBe('mapped steps');
    expect(segmentStepFreeBlock(seg({ highway: 'footway', wheelchair: 'no' }))).toBe('mapped wheelchair=no');
    expect(segmentStepFreeBlock(seg({ highway: 'footway', wheelchair: 'limited' }))).toBeNull();
    expect(segmentStepFreeBlock(seg({ highway: 'footway' }))).toBeNull();
    const node = (tags: Record<string, string>) => ({ index: 0, osmId: 1, coord: [0, 0] as LngLat, tags });
    expect(nodeStepFreeBlock(node({ barrier: 'kerb', kerb: 'raised' }))).toBe('mapped raised kerb');
    expect(nodeStepFreeBlock(node({ barrier: 'kerb', 'kerb:height': '0.05' }))).toBe('mapped kerb 5 cm high');
    expect(nodeStepFreeBlock(node({ barrier: 'kerb', 'kerb:height': '0.02' }))).toBeNull();
    expect(nodeStepFreeBlock(node({ barrier: 'stile' }))).toBe('mapped stile');
    expect(nodeStepFreeBlock(node({ barrier: 'gate' }))).toBeNull(); // often open; flagged, not blocked
    expect(nodeStepFreeBlock(node({ barrier: 'kerb' }))).toBeNull(); // unknown kerb: flagged, not blocked
  });

  it('effort multipliers are >= 1, capped, and unknown is only mildly penalised', () => {
    const opts = { includeSteps: true, includeIncline: true };
    expect(effortMultiplier(seg({ surface: 'asphalt' }), opts)).toBe(1);
    expect(effortMultiplier(seg({}), opts)).toBeCloseTo(1.05);
    expect(effortMultiplier(seg({ surface: 'cobblestone' }), opts)).toBe(2);
    expect(effortMultiplier(seg({ highway: 'steps', surface: 'cobblestone', incline: '20%', smoothness: 'horrible' }), opts)).toBe(10);
  });
});

describe('computeAccessibility', () => {
  it('counts one set of steps across short landings and separate sets otherwise', () => {
    // A straight chain: steps 10 m, landing 5 m, steps 10 m, path 35 m, steps 10 m.
    const xs = [0, 10, 15, 25, 60, 70];
    const kinds = ['steps', 'footway', 'steps', 'footway', 'steps'];
    const nodes = xs.map((x) => P(x, 500));
    const file: GraphFile = {
      ...buildSyntheticGraphFile(),
      nodes: { coords: nodes.flat(), osmIds: nodes.map((_, i) => i + 1), tags: {} },
      edges: kinds.map((highway, i) => ({
        id: i,
        u: i,
        v: i + 1,
        len: haversineM(nodes[i]!, nodes[i + 1]!),
        fwd: true,
        bwd: true,
        ways: [100 + i],
        tags: { highway, ...(highway === 'steps' ? { step_count: '5' } : {}) },
        light: [[0, 1, 'unknown']],
        g: [...nodes[i]!, ...nodes[i + 1]!],
      })),
      lamps: [],
    };
    const g = parseGraph(file);
    const pieces = kinds.map((_, i) => ({ segment: i, reversed: false, fromFrac: 0, toFrac: 1 }));
    const a = computeAccessibility(g, pieces);
    expect(a.steps.flights).toBe(2);
    expect(a.steps.stepCount).toBe(15);
    expect(a.steps.metres).toBeCloseTo(30, 0);
    expect(a.stepFreeBlockers.filter((b) => b.reason === 'mapped steps')).toHaveLength(2);
  });
});

describe('step-free routing', () => {
  const B = NODES.B;
  const E = NODES.E;

  it('never uses mapped steps, and reports what it avoided', () => {
    const r = plan(engineWith(), B, E, { mode: 'step_free' });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest', 'step_free']);
    const [fastest, stepFree] = r.routes as [(typeof r.routes)[0], (typeof r.routes)[0]];
    expect(fastest.accessibility.steps.flights).toBe(1);
    expect(stepFree.accessibility.steps.flights).toBe(0);
    expect(stepFree.accessibility.stepFreeBlockers).toEqual([]);
    expect(stepFree.metrics.distanceM).toBeCloseTo(300, 0);
    expect(stepFree.rationale).toMatch(/Avoids the 1 set of mapped steps on the fastest route/);
    expect(r.recommendedId).toBe('step_free');
    expect(fastest.warnings[0]).toMatch(/Not step-free: 1 set of mapped steps/);
  });

  it('treats wheelchair=no as a hard exclusion', () => {
    const e = engineWith((f) => {
      f.edges[5]!.tags.wheelchair = 'no'; // C-F
    });
    const r = plan(e, B, E, { mode: 'step_free' });
    const stepFree = r.routes.find((x) => x.id === 'step_free')!;
    expect(stepFree.pieces.some((p) => p.segment === 5 || p.segment === 6)).toBe(false);
    expect(stepFree.metrics.distanceM).toBeGreaterThan(350); // B-A-D-E, ~356 m
  });

  it('treats a mapped raised kerb at a node as a hard exclusion and says when no route remains', () => {
    const e = engineWith((f) => {
      f.edges[5]!.tags.wheelchair = 'no';
      f.nodes.tags[String(idx('D'))] = { barrier: 'kerb', kerb: 'raised' };
    });
    const r = plan(e, B, E, { mode: 'step_free' });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest']);
    expect(r.notices[0]).toMatchObject({ id: 'step-free-none', title: 'No verified step-free route' });
    expect(r.routes[0]!.roles).toEqual(['fastest']);
    expect(r.routes[0]!.warnings[0]).toMatch(/Not step-free/);
  });

  it('merges with the fastest route when that is already step-free, and still lists caveats', () => {
    const r = plan(engineWith(), NODES.A, NODES.C, { mode: 'step_free' });
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]!.roles).toEqual(['fastest', 'step_free']);
    expect(r.routes[0]!.warnings[0]).toMatch(/not verified as wheelchair accessible: gradient information is unavailable/);
  });

  it('flags missing kerb data at crossings instead of certifying the route', () => {
    const e = engineWith((f) => {
      f.edges[0]!.tags.footway = 'crossing'; // A-B is a crossing with no kerb tags
    });
    const r = plan(e, NODES.A, NODES.C, { mode: 'step_free' });
    const route = r.routes[0]!;
    expect(route.accessibility.crossings).toMatchObject({ total: 1, kerbUnknown: 1 });
    expect(route.warnings[0]).toMatch(/1 of 1 crossings have no kerb information/);
    expect(route.warnings[0]).toMatch(/surface is unmapped on 100% of it/);

    const known = engineWith((f) => {
      f.edges[0]!.tags.footway = 'crossing';
      f.nodes.tags[String(idx('A'))] = { barrier: 'kerb', kerb: 'lowered' };
    });
    const r2 = plan(known, NODES.A, NODES.C, { mode: 'step_free' });
    expect(r2.routes[0]!.accessibility.crossings).toMatchObject({ total: 1, kerbKnown: 1, kerbUnknown: 0 });
  });

  it('refuses a start that is only reachable over steps', () => {
    const r = planRoutes(engineWith(), P(100, 50), NODES.A, prefs({ mode: 'step_free' })); // on the steps between B and E
    expect(r.ok).toBe(true); // snapped to the nearest step-free walkway within 75 m instead
    if (r.ok) expect(engineWith().graph.segments[r.origin.segment]!.tags.highway).not.toBe('steps');
    const far = planRoutes(engineWith(), P(100, 50), NODES.A, prefs({ mode: 'step_free', avoidSteps: true }));
    expect(far.ok).toBe(true);
  });
});

describe('easier walking', () => {
  it('avoids steps when a modest detour exists', () => {
    const r = plan(engineWith(), NODES.B, NODES.E, { mode: 'easier' });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest', 'easier']);
    const easier = r.routes[1]!;
    expect(easier.accessibility.steps.flights).toBe(0);
    expect(easier.rationale).toMatch(/avoids 1 set of mapped steps/);
    expect(easier.rationale).toMatch(/Gradient information unavailable/);
    expect(r.recommendedId).toBe('easier');
  });

  it('says so when the fastest route has no mapped difficulties', () => {
    const r = plan(engineWith(), NODES.A, NODES.C, { mode: 'easier' });
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]!.roles).toEqual(['fastest', 'easier']);
    expect(r.notices[0]).toMatchObject({ id: 'easier-already' });
  });

  it('prefers smooth surfaces over a mapped rough one', () => {
    const e = engineWith((f) => {
      f.edges[0]!.tags.surface = 'cobblestone'; // A-B
      f.edges[1]!.tags.surface = 'cobblestone'; // B-C
      for (const id of [2, 3, 4, 5]) f.edges[id]!.tags.surface = 'asphalt';
    });
    const r = plan(e, NODES.A, NODES.C, { mode: 'easier', maxDetourMin: 10 });
    const easier = r.routes.find((x) => x.id === 'easier')!;
    expect(easier.accessibility.roughSurfaces).toEqual({});
    expect(r.routes[0]!.accessibility.roughSurfaces.cobblestone).toBeCloseTo(200, 0);
  });

  it('respects the detour cap', () => {
    const r = plan(engineWith(), NODES.B, NODES.E, { mode: 'easier', maxDetourMin: 1 });
    expect(r.routes.map((x) => x.id)).toEqual(['fastest']);
    expect(r.notices[0]).toMatchObject({ id: 'easier-over-cap' });
  });
});

describe('preference switches change the calculation', () => {
  it('avoid steps changes the fastest route itself', () => {
    const without = plan(engineWith(), NODES.B, NODES.E, { mode: 'fastest' });
    const withAvoid = plan(engineWith(), NODES.B, NODES.E, { mode: 'fastest', avoidSteps: true });
    expect(without.routes[0]!.accessibility.steps.flights).toBe(1);
    expect(withAvoid.routes[0]!.accessibility.steps.flights).toBe(0);
    expect(withAvoid.routes[0]!.metrics.distanceM).toBeGreaterThan(without.routes[0]!.metrics.distanceM);
  });

  it('prefer smoother surfaces changes the step-free route', () => {
    const e = engineWith((f) => {
      f.edges[5]!.tags.surface = 'cobblestone'; // C-F on the shorter step-free path
    });
    const plain = plan(e, NODES.B, NODES.E, { mode: 'step_free' });
    const smooth = plan(e, NODES.B, NODES.E, { mode: 'step_free', preferSmoothSurfaces: true });
    const route = (r: typeof plain) => r.routes.find((x) => x.roles.includes('step_free'))!;
    expect(route(plain).accessibility.roughSurfaces.cobblestone).toBeGreaterThan(0);
    expect(route(smooth).accessibility.roughSurfaces.cobblestone).toBeUndefined();
  });

  it('step-free routing prefers to avoid stretches tagged steep, without excluding them', () => {
    const e = engineWith((f) => {
      f.edges[5]!.tags.incline = '12%'; // C-F
    });
    const r = plan(e, NODES.B, NODES.E, { mode: 'step_free' });
    const route = r.routes.find((x) => x.roles.includes('step_free'))!;
    expect(route.accessibility.slope.steepTaggedM).toBe(0);
    expect(route.metrics.distanceM).toBeGreaterThan(350); // took B-A-D-E instead
    // If the only step-free way is tagged steep, it is still used (and reported).
    const forced = engineWith((f) => {
      f.edges[5]!.tags.incline = '12%';
      f.edges[0]!.fwd = false;
      f.edges[0]!.bwd = false;
    });
    const r2 = plan(forced, NODES.B, NODES.E, { mode: 'step_free' });
    expect(r2.routes.find((x) => x.roles.includes('step_free'))!.accessibility.slope.steepTaggedM).toBeGreaterThan(90);
  });

  it('combines better lit, avoid steps and a maximum detour', () => {
    const e = engineWith();
    const within = plan(e, NODES.B, NODES.E, { mode: 'better_lit', avoidSteps: true, maxDetourMin: 3 });
    expect(within.routes.map((x) => x.id)).toEqual(['fastest', 'better_lit']);
    for (const r of within.routes) expect(r.accessibility.steps.flights).toBe(0);
    expect(within.routes[1]!.extraS).toBeLessThanOrEqual(180);
    expect(within.routes[1]!.lighting.litEvidencePct - within.routes[0]!.lighting.litEvidencePct).toBeGreaterThanOrEqual(10);

    const tight = plan(e, NODES.B, NODES.E, { mode: 'better_lit', avoidSteps: true, maxDetourMin: 0.5 });
    expect(tight.routes.map((x) => x.id)).toEqual(['fastest']);
    expect(tight.notices[0]!.id).toBe('better-lit-over-cap');
    expect(tight.routes[0]!.accessibility.steps.flights).toBe(0);
  });

  it('reports when avoiding steps leaves no route at all', () => {
    const e = engineWith((f) => {
      // Cut every non-step link into E.
      f.edges[3]!.fwd = false;
      f.edges[3]!.bwd = false;
      f.edges[4]!.fwd = false;
      f.edges[4]!.bwd = false;
    });
    const r = planRoutes(e, NODES.B, P(100, 100), prefs({ avoidSteps: true }));
    expect(r.ok).toBe(false);
  });
});
