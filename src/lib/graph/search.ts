import { haversineM } from './geo';
import type { SnapResult } from './spatialIndex';
import type { PedestrianGraph, Segment } from './types';

/**
 * A stretch of one segment walked in one direction. Fractions are measured from the segment's
 * `u` end. Walking u→v has fromFrac < toFrac; walking v→u has fromFrac > toFrac (reversed).
 */
export interface RoutePiece {
  segment: number;
  reversed: boolean;
  fromFrac: number;
  toFrac: number;
}

/**
 * Cost of walking part of a segment. Must return a finite number >= 0, or Infinity when the
 * segment must not be used at all (a hard exclusion such as steps for step-free routing).
 */
export type PieceCost = (segment: Segment, fromFrac: number, toFrac: number, reversed: boolean) => number;

export interface SearchRequest {
  start: SnapResult;
  end: SnapResult;
  cost: PieceCost;
  /**
   * Lower bound on cost per metre of straight-line distance, for the A* heuristic.
   * Use 1 / maxSpeed for time-based costs whose multipliers are all >= 1. Use 0 for plain Dijkstra.
   */
  heuristicCostPerMetre: number;
}

export interface SearchResult {
  pieces: RoutePiece[];
  cost: number;
  /** Number of nodes settled; useful for performance checks. */
  settled: number;
}

/** Min-heap keyed by (priority, node) so equal priorities resolve deterministically. */
class MinHeap {
  private keys: number[] = [];
  private nodes: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, node: number): void {
    this.keys.push(key);
    this.nodes.push(node);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { key: number; node: number } | undefined {
    const n = this.keys.length;
    if (n === 0) return undefined;
    const top = { key: this.keys[0]!, node: this.nodes[0]! };
    const lastKey = this.keys.pop()!;
    const lastNode = this.nodes.pop()!;
    if (n > 1) {
      this.keys[0] = lastKey;
      this.nodes[0] = lastNode;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.less(l, m)) m = l;
        if (r < this.keys.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  peekKey(): number {
    return this.keys.length ? this.keys[0]! : Infinity;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a]!;
    const kb = this.keys[b]!;
    return ka < kb || (ka === kb && this.nodes[a]! < this.nodes[b]!);
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.nodes[a], this.nodes[b]] = [this.nodes[b]!, this.nodes[a]!];
  }
}

function checkCost(value: number): number {
  if (Number.isNaN(value) || value < 0) throw new Error(`Invalid edge cost ${value}; costs must be >= 0 or Infinity`);
  return value;
}

const NO_PREV = -2;
const FROM_START = -1;

/**
 * A* search from a snapped start point to a snapped end point.
 * Returns null when no permitted path exists (never a straight-line shortcut).
 */
export function findPath(graph: PedestrianGraph, request: SearchRequest): SearchResult | null {
  const { start, end, cost, heuristicCostPerMetre } = request;
  const nodeCount = graph.nodes.length;
  const g = new Float64Array(nodeCount).fill(Infinity);
  const prevEdge = new Int32Array(nodeCount).fill(NO_PREV);
  const settled = new Uint8Array(nodeCount);
  const startPieces = new Map<number, RoutePiece>();
  const edgeCost = new Float64Array(graph.edges.length).fill(NaN);
  const heap = new MinHeap();
  const target = end.point;
  const h = (node: number) =>
    heuristicCostPerMetre > 0 ? haversineM(graph.nodes[node]!.coord, target) * heuristicCostPerMetre : 0;

  const startSeg = graph.segments[start.segment]!;
  const endSeg = graph.segments[end.segment]!;

  // Leave the start point towards either end of its segment, if that direction is walkable.
  const seeds: { node: number; piece: RoutePiece; allowed: boolean }[] = [
    { node: startSeg.u, piece: { segment: startSeg.id, reversed: true, fromFrac: start.fraction, toFrac: 0 }, allowed: startSeg.backwardAllowed },
    { node: startSeg.v, piece: { segment: startSeg.id, reversed: false, fromFrac: start.fraction, toFrac: 1 }, allowed: startSeg.forwardAllowed },
  ];
  for (const seed of seeds) {
    if (!seed.allowed) continue;
    const c = checkCost(cost(startSeg, seed.piece.fromFrac, seed.piece.toFrac, seed.piece.reversed));
    if (!Number.isFinite(c) || c >= g[seed.node]!) continue;
    g[seed.node] = c;
    prevEdge[seed.node] = FROM_START;
    startPieces.set(seed.node, seed.piece);
    heap.push(c + h(seed.node), seed.node);
  }

  // Arrive at the end point from either end of its segment.
  const exits = new Map<number, { extra: number; piece: RoutePiece }>();
  const exitOptions: { node: number; piece: RoutePiece; allowed: boolean }[] = [
    { node: endSeg.u, piece: { segment: endSeg.id, reversed: false, fromFrac: 0, toFrac: end.fraction }, allowed: endSeg.forwardAllowed },
    { node: endSeg.v, piece: { segment: endSeg.id, reversed: true, fromFrac: 1, toFrac: end.fraction }, allowed: endSeg.backwardAllowed },
  ];
  for (const option of exitOptions) {
    if (!option.allowed) continue;
    const c = checkCost(cost(endSeg, option.piece.fromFrac, option.piece.toFrac, option.piece.reversed));
    if (!Number.isFinite(c)) continue;
    const existing = exits.get(option.node);
    if (!existing || c < existing.extra) exits.set(option.node, { extra: c, piece: option.piece });
  }

  let best = Infinity;
  let bestExitNode = -1;
  let directPiece: RoutePiece | null = null;

  // Start and end on the same segment: walking straight along it is a candidate.
  if (start.segment === end.segment) {
    const reversed = end.fraction < start.fraction;
    const allowed = reversed ? startSeg.backwardAllowed : startSeg.forwardAllowed;
    if (allowed) {
      const piece: RoutePiece = { segment: startSeg.id, reversed, fromFrac: start.fraction, toFrac: end.fraction };
      const c = checkCost(cost(startSeg, piece.fromFrac, piece.toFrac, reversed));
      if (Number.isFinite(c)) {
        best = c;
        directPiece = piece;
      }
    }
  }

  let settledCount = 0;
  while (heap.size > 0) {
    if (heap.peekKey() >= best) break;
    const item = heap.pop()!;
    const node = item.node;
    if (settled[node]) continue;
    settled[node] = 1;
    settledCount++;
    const gn = g[node]!;

    const exit = exits.get(node);
    if (exit && gn + exit.extra < best) {
      best = gn + exit.extra;
      bestExitNode = node;
      directPiece = null;
    }

    for (let i = graph.adjStart[node]!; i < graph.adjStart[node + 1]!; i++) {
      const edgeId = graph.adjEdges[i]!;
      const edge = graph.edges[edgeId]!;
      if (settled[edge.to]) continue;
      let c = edgeCost[edgeId]!;
      if (Number.isNaN(c)) {
        const seg = graph.segments[edge.segment]!;
        c = checkCost(edge.reversed ? cost(seg, 1, 0, true) : cost(seg, 0, 1, false));
        edgeCost[edgeId] = c;
      }
      if (!Number.isFinite(c)) continue;
      const candidate = gn + c;
      if (candidate < g[edge.to]!) {
        g[edge.to] = candidate;
        prevEdge[edge.to] = edgeId;
        heap.push(candidate + h(edge.to), edge.to);
      }
    }
  }

  if (!Number.isFinite(best)) return null;
  if (directPiece) return { pieces: [directPiece], cost: best, settled: settledCount };

  const middle: RoutePiece[] = [];
  let node = bestExitNode;
  let guard = 0;
  while (prevEdge[node] !== FROM_START) {
    const edgeId = prevEdge[node]!;
    if (edgeId < 0 || ++guard > nodeCount) throw new Error('Path reconstruction failed');
    const edge = graph.edges[edgeId]!;
    middle.push({ segment: edge.segment, reversed: edge.reversed, fromFrac: edge.reversed ? 1 : 0, toFrac: edge.reversed ? 0 : 1 });
    node = edge.from;
  }
  middle.reverse();
  const pieces = [startPieces.get(node)!, ...middle, exits.get(bestExitNode)!.piece].filter(
    (p) => Math.abs(p.toFrac - p.fromFrac) > 1e-9,
  );
  return { pieces, cost: best, settled: settledCount };
}
