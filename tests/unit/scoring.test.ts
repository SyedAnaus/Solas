import { describe, expect, it } from 'vitest';
import { parseGraph } from '../../src/lib/graph/parse';
import { makeCost, lightingMetresInRange } from '../../src/lib/scoring/costs';
import { exactShares, formatShare, roundSharesToStep } from '../../src/lib/scoring/percent';
import { computeRouteMetrics } from '../../src/lib/scoring/metrics';
import { buildSyntheticGraphFile } from '../fixtures/syntheticGraph';

const graph = parseGraph(buildSyntheticGraphFile());

describe('roundSharesToStep', () => {
  it('always totals exactly 100', () => {
    const cases = [
      { mapped_lit: 33.3, likely_lit: 33.3, mapped_unlit: 0, unknown: 33.4 },
      { mapped_lit: 1, likely_lit: 1, mapped_unlit: 1, unknown: 997 },
      { mapped_lit: 12.4, likely_lit: 47.6, mapped_unlit: 2.5, unknown: 37.5 },
      { mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 5 },
    ];
    for (const c of cases) {
      const r = roundSharesToStep(c, 5);
      expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(100);
      for (const v of Object.values(r)) expect(v % 5).toBe(0);
    }
  });

  it('rounds to the nearest step where possible', () => {
    expect(roundSharesToStep({ a: 62, b: 38 }, 5)).toEqual({ a: 60, b: 40 });
    expect(roundSharesToStep({ a: 63, b: 37 }, 5)).toEqual({ a: 65, b: 35 });
  });

  it('returns zeros for an empty route', () => {
    expect(roundSharesToStep({ a: 0, b: 0 }, 5)).toEqual({ a: 0, b: 0 });
  });

  it('exact shares sum to 100', () => {
    const s = exactShares({ a: 1, b: 2, c: 7 });
    expect(s.a + s.b + s.c).toBeCloseTo(100, 10);
  });

  it('never shows a small non-zero share as 0%', () => {
    expect(formatShare(0, 1.2, 5)).toBe('<5%');
    expect(formatShare(100, 98.9, 5)).toBe('>95%');
    expect(formatShare(40, 41, 5)).toBe('40%');
  });
});

describe('lighting metres', () => {
  it('splits a mixed segment by fraction', () => {
    const seg = graph.segments[4]!; // half unknown, half likely_lit
    const all = lightingMetresInRange(seg, 0, 1);
    expect(all.unknown).toBeCloseTo(seg.length / 2, 6);
    expect(all.likely_lit).toBeCloseTo(seg.length / 2, 6);
    const part = lightingMetresInRange(seg, 0.25, 0.75);
    expect(part.unknown).toBeCloseTo(seg.length / 4, 6);
    expect(part.likely_lit).toBeCloseTo(seg.length / 4, 6);
  });

  it('keeps lamp provenance on likely_lit stretches', () => {
    const seg = graph.segments[4]!;
    expect(seg.light[1]).toMatchObject({ cls: 'likely_lit', lamps: [9001] });
    expect(seg.lamps).toEqual([9001]);
  });

  it('keeps unknown and mapped_unlit separate in route metrics', () => {
    const pieces = [
      { segment: 0, reversed: false, fromFrac: 0, toFrac: 1 }, // unknown
      { segment: 1, reversed: false, fromFrac: 0, toFrac: 1 }, // mapped_unlit
    ];
    const m = computeRouteMetrics(graph, pieces, { speedMps: 1.3, percentStep: 5 });
    expect(m.lighting.metres.unknown).toBeCloseTo(100, 0);
    expect(m.lighting.metres.mapped_unlit).toBeCloseTo(100, 0);
    expect(m.lighting.roundedPercent).toEqual({ mapped_lit: 0, likely_lit: 0, mapped_unlit: 50, unknown: 50 });
  });
});

describe('makeCost', () => {
  it('plain walking time is length / speed', () => {
    const cost = makeCost({ speedMps: 2 });
    const seg = graph.segments[0]!;
    expect(cost(seg, 0, 1, false)).toBeCloseTo(seg.length / 2, 9);
    expect(cost(seg, 0.75, 0.25, true)).toBeCloseTo(seg.length / 4, 9);
  });

  it('penalises unknown less than known darkness when configured so', () => {
    const cost = makeCost({ speedMps: 1, lighting: { mapped_lit: 1, likely_lit: 1.2, unknown: 2, mapped_unlit: 4 } });
    const unknown = cost(graph.segments[0]!, 0, 1, false);
    const unlit = cost(graph.segments[1]!, 0, 1, false);
    expect(unknown).toBeLessThan(unlit);
  });

  it('rejects multipliers below 1 (they would break the A* heuristic)', () => {
    expect(() => makeCost({ speedMps: 1, lighting: { mapped_lit: 0.5, likely_lit: 1, unknown: 1, mapped_unlit: 1 } })).toThrow();
  });

  it('returns Infinity for excluded segments', () => {
    const cost = makeCost({ speedMps: 1, exclude: (s) => s.tags.highway === 'steps' });
    expect(cost(graph.segments[6]!, 0, 1, false)).toBe(Infinity);
  });
});
