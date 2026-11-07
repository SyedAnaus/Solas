/**
 * SYNTHETIC test graph. Not real geography: it sits at 0°N 0°E ("Null Island") and is marked
 * `synthetic: true`. It exists only to exercise routing logic in tests.
 *
 *   D(0,100) ~~lit~~ E(100,100) ─half unknown/half likely─ F(200,100)
 *     │lit             │steps,lit                            │lit
 *   A(0,0) ─unknown─ B(100,0) ──────────unlit────────── C(200,0) ──one-way──> I(300,0)
 *
 *   D–E bends north through (50,160), so it is ~156 m long. The lit detour A→D→E→F→C is
 *   ~456 m against 200 m for the fastest A→B→C: about 3.3 extra minutes at 1.3 m/s.
 *
 *   G(300,300) ── H(400,300)   (an island, not connected to anything else)
 *
 * Coordinates are metres east/north of the origin, converted with a local projection.
 */
import { haversineM, localProjection } from '../../src/lib/graph/geo';
import type { GraphFile, GraphFileEdge, LightingClass, LngLat } from '../../src/lib/graph/types';

const proj = localProjection(0, 0);
export const P = (x: number, y: number): LngLat => {
  const [lon, lat] = proj.toLngLat([x, y]);
  return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
};

export const NODES = {
  A: P(0, 0),
  B: P(100, 0),
  C: P(200, 0),
  D: P(0, 100),
  E: P(100, 100),
  F: P(200, 100),
  G: P(300, 300),
  H: P(400, 300),
  I: P(300, 0),
} as const;
export type NodeName = keyof typeof NODES;
export const NODE_ORDER = Object.keys(NODES) as NodeName[];
export const idx = (n: NodeName) => NODE_ORDER.indexOf(n);

type LightSpec = [number, number, LightingClass] | [number, number, LightingClass, number[]];

interface EdgeSpec {
  u: NodeName;
  v: NodeName;
  light: LightSpec[];
  tags?: Record<string, string>;
  fwd?: boolean;
  bwd?: boolean;
  /** Extra intermediate points (metres) to give the edge a bend. */
  via?: [number, number][];
}

export const EDGE_SPECS: EdgeSpec[] = [
  { u: 'A', v: 'B', light: [[0, 1, 'unknown']], tags: { highway: 'footway' } }, // 0
  { u: 'B', v: 'C', light: [[0, 1, 'mapped_unlit']], tags: { highway: 'footway', lit: 'no' } }, // 1
  { u: 'A', v: 'D', light: [[0, 1, 'mapped_lit']], tags: { highway: 'residential', lit: 'yes' } }, // 2
  { u: 'D', v: 'E', light: [[0, 1, 'mapped_lit']], tags: { highway: 'residential', lit: 'yes' }, via: [[50, 160]] }, // 3
  { u: 'E', v: 'F', light: [[0, 0.5, 'unknown'], [0.5, 1, 'likely_lit', [9001]]], tags: { highway: 'residential' } }, // 4
  { u: 'C', v: 'F', light: [[0, 1, 'mapped_lit']], tags: { highway: 'residential', lit: 'yes' } }, // 5
  { u: 'B', v: 'E', light: [[0, 1, 'mapped_lit']], tags: { highway: 'steps', lit: 'yes' } }, // 6
  { u: 'G', v: 'H', light: [[0, 1, 'unknown']], tags: { highway: 'footway' } }, // 7
  { u: 'C', v: 'I', light: [[0, 1, 'unknown']], tags: { highway: 'footway', 'oneway:foot': 'yes' }, fwd: true, bwd: false }, // 8
];

export function buildSyntheticGraphFile(overrides: Partial<GraphFile['meta']> = {}): GraphFile {
  const edges: GraphFileEdge[] = EDGE_SPECS.map((spec, id) => {
    const coords: LngLat[] = [NODES[spec.u], ...(spec.via ?? []).map(([x, y]) => P(x, y)), NODES[spec.v]];
    let len = 0;
    for (let i = 1; i < coords.length; i++) len += haversineM(coords[i - 1]!, coords[i]!);
    return {
      id,
      u: idx(spec.u),
      v: idx(spec.v),
      len,
      fwd: spec.fwd ?? true,
      bwd: spec.bwd ?? true,
      ways: [1000 + id],
      tags: spec.tags ?? {},
      light: spec.light,
      g: coords.flat(),
    };
  });
  const ring: LngLat[] = [P(-100, -100), P(500, -100), P(500, 400), P(-100, 400), P(-100, -100)];
  return {
    schema: 'solas-graph',
    meta: {
      schemaVersion: 1,
      synthetic: true,
      areaId: 'synthetic-test-grid',
      areaName: 'Synthetic test grid (not real geography)',
      generatedAt: '2026-01-01T00:00:00Z',
      osmDataTimestamps: [],
      coverage: {
        type: 'Polygon',
        coordinates: [ring],
        bbox: [ring[0]![0], ring[0]![1], ring[2]![0], ring[2]![1]],
        method: 'synthetic',
        areaKm2: 0.36,
      },
      counts: { nodes: NODE_ORDER.length, segments: edges.length, directedEdges: 17, totalLengthM: 0, lampsMapped: 0, lampsNearNetwork: 0, stepsSegments: 1, landmarks: 0 },
      lightingMetres: { mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 0 },
      sources: [],
      licence: 'Synthetic test data',
      ...overrides,
    },
    nodes: { coords: NODE_ORDER.flatMap((n) => NODES[n]), osmIds: NODE_ORDER.map((_, i) => i + 1), tags: {} },
    edges,
    lamps: [{ id: 9001, c: P(150, 110) }],
  };
}
