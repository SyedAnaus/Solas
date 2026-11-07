/**
 * Checks against the REAL committed Cork dataset (public/data/cork), generated from OpenStreetMap
 * by scripts/prepare_cork_data.py. If the dataset is regenerated these tests must still hold.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/data/loadDataset';
import { haversineM, polylineLengthM } from '../../src/lib/graph/geo';
import { parseGraph } from '../../src/lib/graph/parse';
import { RoutingEngine } from '../../src/lib/routing/engine';

// Vitest runs from the project root.
const file = (name: string) => resolve(process.cwd(), 'public/data/cork', name);
const manifest = validateManifest(JSON.parse(readFileSync(file('manifest.json'), 'utf8')));
const graph = parseGraph(JSON.parse(readFileSync(file('graph.json'), 'utf8')));
const engine = new RoutingEngine(graph);
const landmark = (id: string) => {
  const l = manifest.landmarks.find((x) => x.id === id);
  if (!l) throw new Error(`landmark ${id} missing`);
  return l;
};

describe('Cork dataset', () => {
  it('is real OSM-derived data, not a synthetic fixture', () => {
    expect(manifest.synthetic).toBe(false);
    expect(graph.meta.synthetic).toBe(false);
    expect(graph.meta.sources.some((s) => s.name === 'OpenStreetMap' && s.licence === 'ODbL-1.0')).toBe(true);
    expect(graph.nodes.length).toBe(manifest.counts.nodes);
    expect(graph.segments.length).toBe(manifest.counts.segments);
  });

  it('lighting classes cover the whole network length', () => {
    const lm = manifest.lightingMetres;
    const sum = lm.mapped_lit + lm.likely_lit + lm.mapped_unlit + lm.unknown;
    expect(Math.abs(sum - manifest.counts.totalLengthM) / manifest.counts.totalLengthM).toBeLessThan(0.001);
  });

  it('every landmark routing point lies on the walking network', () => {
    for (const l of manifest.landmarks) {
      const snap = engine.index.nearest(l.routingPoint, 5);
      expect(snap, l.id).not.toBeNull();
      expect(snap!.distanceM, l.id).toBeLessThan(1);
    }
  });
});

describe('UCC Main Quadrangle → Parnell Place Bus Station (fastest)', () => {
  const from = landmark('ucc-quad').routingPoint;
  const to = landmark('parnell-place').routingPoint;
  const outcome = engine.planFastest(from, to);

  it('finds a connected route on the real graph', () => {
    expect(outcome.ok).toBe(true);
  });

  it('has plausible length and geometry that agrees with its metrics', () => {
    if (!outcome.ok) throw new Error('no route');
    const route = outcome.routes[0]!;
    const straight = haversineM(from, to);
    expect(route.metrics.distanceM).toBeGreaterThan(straight);
    expect(route.metrics.distanceM).toBeLessThan(straight * 1.6);
    const drawn = polylineLengthM(route.geometry.coordinates);
    expect(Math.abs(drawn - route.metrics.distanceM) / route.metrics.distanceM).toBeLessThan(0.005);
    expect(haversineM(route.geometry.coordinates[0]!, from)).toBeLessThan(1);
    expect(haversineM(route.geometry.coordinates.at(-1)!, to)).toBeLessThan(1);
  });

  it('only uses routable outdoor segments and consecutive pieces connect', () => {
    if (!outcome.ok) throw new Error('no route');
    const pieces = outcome.routes[0]!.pieces;
    for (const p of pieces) expect(graph.segments[p.segment]!.tags.highway).not.toBe('corridor');
    for (let i = 1; i < pieces.length; i++) {
      const prev = graph.segments[pieces[i - 1]!.segment]!;
      const cur = graph.segments[pieces[i]!.segment]!;
      const prevEnd = pieces[i - 1]!.reversed ? prev.u : prev.v;
      const curStart = pieces[i]!.reversed ? cur.v : cur.u;
      expect(curStart).toBe(prevEnd);
    }
  });

  it('computes quickly once the graph is loaded', () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) engine.planFastest(from, to);
    const avg = (performance.now() - t0) / 5;
    // Generous bound for CI machines; the UI shows the measured time.
    expect(avg).toBeLessThan(500);
  });
});
