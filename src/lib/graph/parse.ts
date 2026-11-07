import { cumulativeDistances, haversineM } from './geo';
import {
  LIGHTING_CLASSES,
  type GraphFile,
  type LightingClass,
  type LightingInterval,
  type LngLat,
  type PedestrianEdge,
  type PedestrianGraph,
  type PedestrianNode,
  type Segment,
} from './types';

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

const LIGHTING_SET = new Set<string>(LIGHTING_CLASSES);

/** Max distance (m) allowed between a segment's geometry ends and its nodes. */
const END_TOLERANCE_M = 0.5;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatasetError(message);
}

function normaliseLight(raw: unknown, edgeId: number): LightingInterval[] {
  assert(Array.isArray(raw) && raw.length > 0, `edge ${edgeId}: missing lighting intervals`);
  const out: LightingInterval[] = [];
  let cursor = 0;
  for (const item of raw as unknown[]) {
    assert(Array.isArray(item) && item.length === 3, `edge ${edgeId}: malformed lighting interval`);
    const [from, to, cls] = item as [unknown, unknown, unknown];
    assert(typeof from === 'number' && typeof to === 'number' && to >= from, `edge ${edgeId}: bad interval bounds`);
    assert(typeof cls === 'string' && LIGHTING_SET.has(cls), `edge ${edgeId}: unknown lighting class ${String(cls)}`);
    assert(Math.abs(from - cursor) < 1e-3, `edge ${edgeId}: lighting intervals have a gap or overlap`);
    out.push({ from, to, cls: cls as LightingClass });
    cursor = to;
  }
  assert(Math.abs(cursor - 1) < 1e-3, `edge ${edgeId}: lighting intervals do not cover the whole edge`);
  return out;
}

/** Validate a graph file and build the in-memory routing structure. Throws DatasetError. */
export function parseGraph(input: unknown): PedestrianGraph {
  assert(input && typeof input === 'object', 'graph file is not an object');
  const file = input as GraphFile;
  assert(file.schema === 'solas-graph', 'not a Solas graph file');
  assert(file.meta && typeof file.meta === 'object', 'graph file has no metadata');
  assert(file.meta.schemaVersion === 1, `unsupported graph schema version ${String(file.meta.schemaVersion)}`);
  assert(typeof file.meta.synthetic === 'boolean', 'graph metadata must state whether it is synthetic');
  assert(Array.isArray(file.nodes?.coords) && Array.isArray(file.nodes?.osmIds), 'graph nodes are missing');
  assert(file.nodes.coords.length === file.nodes.osmIds.length * 2, 'node coordinate count mismatch');
  assert(Array.isArray(file.edges), 'graph edges are missing');

  const nodeCount = file.nodes.osmIds.length;
  const nodes: PedestrianNode[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const lon = file.nodes.coords[i * 2]!;
    const lat = file.nodes.coords[i * 2 + 1]!;
    assert(Number.isFinite(lon) && Number.isFinite(lat), `node ${i}: invalid coordinates`);
    const tags = file.nodes.tags?.[String(i)];
    nodes[i] = { index: i, osmId: file.nodes.osmIds[i]!, coord: [lon, lat], ...(tags ? { tags } : {}) };
  }

  const segments: Segment[] = new Array(file.edges.length);
  const edges: (PedestrianEdge | null)[] = new Array(file.edges.length * 2).fill(null);
  const outDegree = new Int32Array(nodeCount);

  file.edges.forEach((e, position) => {
    assert(e.id === position, `edge ids must be dense and ordered (expected ${position}, got ${e.id})`);
    assert(Number.isInteger(e.u) && e.u >= 0 && e.u < nodeCount, `edge ${e.id}: bad start node`);
    assert(Number.isInteger(e.v) && e.v >= 0 && e.v < nodeCount, `edge ${e.id}: bad end node`);
    assert(e.u !== e.v, `edge ${e.id}: self-loop`);
    assert(Number.isFinite(e.len) && e.len > 0, `edge ${e.id}: length must be positive`);
    assert(Array.isArray(e.g) && e.g.length >= 4 && e.g.length % 2 === 0, `edge ${e.id}: bad geometry`);

    const coords: LngLat[] = [];
    for (let i = 0; i < e.g.length; i += 2) coords.push([e.g[i]!, e.g[i + 1]!]);
    const startGap = haversineM(coords[0]!, nodes[e.u]!.coord);
    const endGap = haversineM(coords[coords.length - 1]!, nodes[e.v]!.coord);
    assert(startGap <= END_TOLERANCE_M && endGap <= END_TOLERANCE_M, `edge ${e.id}: geometry does not meet its nodes`);

    segments[e.id] = {
      id: e.id,
      u: e.u,
      v: e.v,
      length: e.len,
      coords,
      cumulative: cumulativeDistances(coords, e.len),
      tags: e.tags ?? {},
      light: normaliseLight(e.light, e.id),
      lamps: e.lamps ?? [],
      ways: e.ways ?? [],
      forwardAllowed: Boolean(e.fwd),
      backwardAllowed: Boolean(e.bwd),
    };
    if (e.fwd) {
      edges[e.id * 2] = { id: e.id * 2, segment: e.id, from: e.u, to: e.v, reversed: false, length: e.len };
      outDegree[e.u]! += 1;
    }
    if (e.bwd) {
      edges[e.id * 2 + 1] = { id: e.id * 2 + 1, segment: e.id, from: e.v, to: e.u, reversed: true, length: e.len };
      outDegree[e.v]! += 1;
    }
  });

  const adjStart = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) adjStart[i + 1] = adjStart[i]! + outDegree[i]!;
  const adjEdges = new Int32Array(adjStart[nodeCount]!);
  const fill = adjStart.slice(0, nodeCount);
  for (const edge of edges) {
    if (!edge) continue;
    adjEdges[fill[edge.from]!] = edge.id;
    fill[edge.from]! += 1;
  }

  const lamps = (file.lamps ?? []).map((l) => ({ id: l.id, coord: l.c, ...(l.tags ? { tags: l.tags } : {}) }));
  return { meta: file.meta, nodes, segments, edges, adjStart, adjEdges, lamps };
}
