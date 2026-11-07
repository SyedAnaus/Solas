import { describe, expect, it } from 'vitest';
import { haversineM, polylineLengthM } from '../../src/lib/graph/geo';
import { DatasetError, parseGraph } from '../../src/lib/graph/parse';
import { buildRouteGeometry } from '../../src/lib/graph/route';
import { findPath } from '../../src/lib/graph/search';
import { SegmentIndex, snapToNetwork, type SnapResult } from '../../src/lib/graph/spatialIndex';
import { makeCost } from '../../src/lib/scoring/costs';
import { computeRouteMetrics } from '../../src/lib/scoring/metrics';
import { RoutingEngine } from '../../src/lib/routing/engine';
import { buildSyntheticGraphFile, idx, NODES, P } from '../fixtures/syntheticGraph';

const graph = parseGraph(buildSyntheticGraphFile());
const index = new SegmentIndex(graph, 60);
const SPEED = 1.3;
const time = makeCost({ speedMps: SPEED });

function snapAt(x: number, y: number): SnapResult {
  const r = snapToNetwork(graph, index, P(x, y), 75);
  if (!r.ok) throw new Error(r.error.message);
  return r.snap;
}

function nodesOf(pieces: { segment: number; reversed: boolean }[]): number[] {
  return pieces.map((p) => {
    const s = graph.segments[p.segment]!;
    return p.reversed ? s.u : s.v;
  });
}

describe('parseGraph', () => {
  it('builds directed edges only for permitted directions', () => {
    expect(graph.meta.synthetic).toBe(true);
    expect(graph.edges[8 * 2]).not.toBeNull(); // C→I allowed
    expect(graph.edges[8 * 2 + 1]).toBeNull(); // I→C forbidden
    const outOfI = graph.adjStart[idx('I') + 1]! - graph.adjStart[idx('I')]!;
    expect(outOfI).toBe(0);
  });

  it('rejects geometry that does not meet its nodes', () => {
    const file = buildSyntheticGraphFile();
    file.edges[0]!.g[0] = file.edges[0]!.g[0]! + 0.01;
    expect(() => parseGraph(file)).toThrow(DatasetError);
  });

  it('rejects lighting intervals with gaps', () => {
    const file = buildSyntheticGraphFile();
    file.edges[0]!.light = [[0, 0.4, 'unknown'], [0.6, 1, 'mapped_lit']];
    expect(() => parseGraph(file)).toThrow(/gap or overlap/);
  });

  it('requires an explicit synthetic flag', () => {
    const file = buildSyntheticGraphFile() as unknown as { meta: Record<string, unknown> };
    delete file.meta.synthetic;
    expect(() => parseGraph(file)).toThrow(/synthetic/);
  });
});

describe('snapping', () => {
  it('snaps to the nearest point on the nearest segment', () => {
    const s = snapAt(50, 10);
    expect(s.segment).toBe(0);
    expect(s.fraction).toBeCloseTo(0.5, 2);
    expect(s.distanceM).toBeCloseTo(10, 0);
  });

  it('refuses points too far from any walkway', () => {
    const r = snapToNetwork(graph, index, P(250, 220), 30);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('too-far');
  });

  it('refuses points outside the covered area', () => {
    const r = snapToNetwork(graph, index, P(2000, 2000), 75);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('outside-coverage');
  });

  it('respects a segment filter (e.g. no steps)', () => {
    const near = snapToNetwork(graph, index, P(102, 50), 75);
    expect(near.ok && near.snap.segment).toBe(6);
    const filtered = snapToNetwork(graph, index, P(102, 50), 75, (s) => s.tags.highway !== 'steps');
    expect(filtered.ok && filtered.snap.segment).not.toBe(6);
  });
});

describe('findPath', () => {
  it('finds the shortest path (A → C goes along the bottom)', () => {
    const r = findPath(graph, { start: snapAt(0, 0), end: snapAt(200, 0), cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    expect(r).not.toBeNull();
    const m = computeRouteMetrics(graph, r.pieces, { speedMps: SPEED, percentStep: 5 });
    expect(m.distanceM).toBeCloseTo(200, 0);
    expect(nodesOf(r.pieces)).toContain(idx('B'));
  });

  it('A* and plain Dijkstra agree on cost', () => {
    const start = snapAt(10, 0);
    const end = snapAt(200, 60);
    const astar = findPath(graph, { start, end, cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    const dijkstra = findPath(graph, { start, end, cost: time, heuristicCostPerMetre: 0 })!;
    expect(astar.cost).toBeCloseTo(dijkstra.cost, 6);
  });

  it('starts and ends part-way along segments', () => {
    const r = findPath(graph, { start: snapAt(25, 0), end: snapAt(175, 0), cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    const m = computeRouteMetrics(graph, r.pieces, { speedMps: SPEED, percentStep: 5 });
    expect(m.distanceM).toBeCloseTo(150, 0);
  });

  it('walks directly along one segment when both points are on it', () => {
    const r = findPath(graph, { start: snapAt(80, 0), end: snapAt(20, 0), cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0]).toMatchObject({ segment: 0, reversed: true });
    expect(r.pieces[0]!.fromFrac).toBeCloseTo(0.8, 3);
    expect(r.pieces[0]!.toFrac).toBeCloseTo(0.2, 3);
  });

  it('treats hard exclusions as impassable, never as small penalties', () => {
    const noSteps = makeCost({ speedMps: SPEED, exclude: (s) => s.tags.highway === 'steps' });
    const withSteps = findPath(graph, { start: snapAt(100, 0), end: snapAt(100, 100), cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    const stepFree = findPath(graph, { start: snapAt(100, 0), end: snapAt(100, 100), cost: noSteps, heuristicCostPerMetre: 1 / SPEED })!;
    expect(withSteps.pieces.some((p) => p.segment === 6)).toBe(true);
    expect(stepFree.pieces.some((p) => p.segment === 6)).toBe(false);
    const m = computeRouteMetrics(graph, stepFree.pieces, { speedMps: SPEED, percentStep: 5 });
    expect(m.distanceM).toBeCloseTo(300, 0);
    expect(m.steps.segments).toBe(0);
  });

  it('respects one-way pedestrian edges', () => {
    const forward = findPath(graph, { start: snapAt(0, 0), end: snapAt(290, 0), cost: time, heuristicCostPerMetre: 1 / SPEED });
    expect(forward).not.toBeNull();
    const backward = findPath(graph, { start: snapAt(290, 0), end: snapAt(0, 0), cost: time, heuristicCostPerMetre: 1 / SPEED });
    expect(backward).toBeNull();
  });

  it('returns null for disconnected parts of the network', () => {
    const r = findPath(graph, { start: snapAt(350, 300), end: snapAt(0, 0), cost: time, heuristicCostPerMetre: 1 / SPEED });
    expect(r).toBeNull();
  });

  it('rejects negative or NaN costs', () => {
    const bad = () => -1;
    expect(() => findPath(graph, { start: snapAt(0, 0), end: snapAt(200, 0), cost: bad, heuristicCostPerMetre: 0 })).toThrow(/Invalid edge cost/);
  });
});

describe('route geometry', () => {
  it('matches the metrics and connects end to end', () => {
    const start = snapAt(30, 5);
    const end = snapAt(195, 70);
    const r = findPath(graph, { start, end, cost: time, heuristicCostPerMetre: 1 / SPEED })!;
    const geom = buildRouteGeometry(graph, r.pieces);
    const m = computeRouteMetrics(graph, r.pieces, { speedMps: SPEED, percentStep: 5 });
    expect(haversineM(geom.coordinates[0]!, start.point)).toBeLessThan(0.5);
    expect(haversineM(geom.coordinates[geom.coordinates.length - 1]!, end.point)).toBeLessThan(0.5);
    expect(polylineLengthM(geom.coordinates)).toBeCloseTo(m.distanceM, 0);
    // Every vertex is on the network: consecutive pieces share endpoints, so no jumps > the longest straight piece.
    for (let i = 1; i < geom.coordinates.length; i++) {
      expect(haversineM(geom.coordinates[i - 1]!, geom.coordinates[i]!)).toBeLessThanOrEqual(100.5);
    }
  });
});

describe('RoutingEngine.planFastest', () => {
  const engine = new RoutingEngine(graph);

  it('returns one fastest route with metrics', () => {
    const out = engine.planFastest(NODES.A, NODES.C);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.routes).toHaveLength(1);
    expect(out.routes[0]!.metrics.distanceM).toBeCloseTo(200, 0);
    const { distanceM, durationS } = out.routes[0]!.metrics;
    expect(durationS).toBeCloseTo(distanceM / engine.config.walkingSpeedMps, 9);
    expect(out.computeMs).toBeGreaterThanOrEqual(0);
  });

  it('explains unreachable destinations instead of drawing a line', () => {
    const out = engine.planFastest(NODES.A, P(350, 300));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('no-path');
  });

  it('rejects identical start and destination', () => {
    const out = engine.planFastest(P(50, 0), P(52, 0));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('same-place');
  });

  it('reports which endpoint could not be matched', () => {
    const out = engine.planFastest(NODES.A, P(2000, 2000));
    expect(out.ok).toBe(false);
    if (!out.ok && out.error.kind === 'snap') {
      expect(out.error.which).toBe('destination');
      expect(out.error.failure.reason).toBe('outside-coverage');
    } else {
      throw new Error('expected a snap error');
    }
  });
});
