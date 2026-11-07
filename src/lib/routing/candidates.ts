import { segmentUsage } from '../graph/route';
import type { RoutePiece } from '../graph/search';
import type { PedestrianGraph } from '../graph/types';

/**
 * Share of the longer route that both routes walk (0..1), measured on real segment metres.
 * 1 means the same physical path.
 */
export function routeOverlap(graph: PedestrianGraph, a: RoutePiece[], b: RoutePiece[]): number {
  const ua = segmentUsage(graph, a);
  const ub = segmentUsage(graph, b);
  let lenA = 0;
  let lenB = 0;
  for (const m of ua.values()) lenA += m;
  for (const m of ub.values()) lenB += m;
  const longer = Math.max(lenA, lenB);
  if (longer <= 0) return 1;
  let shared = 0;
  for (const [seg, m] of ua) {
    const other = ub.get(seg);
    if (other !== undefined) shared += Math.min(m, other);
  }
  return shared / longer;
}

/** Stable text key for a path, used for deterministic tie-breaks. */
export function routeSignature(pieces: RoutePiece[]): string {
  return pieces.map((p) => `${p.segment}${p.reversed ? 'r' : 'f'}`).join('.');
}

/**
 * Remove near-duplicates, keeping the first occurrence. `reference` routes (for example the
 * fastest route) are never returned but anything overlapping them is dropped.
 */
export function dedupeRoutes<T extends { pieces: RoutePiece[] }>(
  graph: PedestrianGraph,
  items: T[],
  ratio: number,
  reference: RoutePiece[][] = [],
): { kept: T[]; duplicates: T[] } {
  const kept: T[] = [];
  const duplicates: T[] = [];
  for (const item of items) {
    const dup =
      reference.some((r) => routeOverlap(graph, r, item.pieces) >= ratio) ||
      kept.some((k) => routeOverlap(graph, k.pieces, item.pieces) >= ratio);
    if (dup) duplicates.push(item);
    else kept.push(item);
  }
  return { kept, duplicates };
}
