import { pieceLengthM } from '../graph/route';
import type { RoutePiece } from '../graph/search';
import { LIGHTING_CLASSES, type LightingClass, type PedestrianGraph } from '../graph/types';
import { lightingMetresInRange } from './costs';
import { exactShares, roundSharesToStep } from './percent';

export interface LightingBreakdown {
  metres: Record<LightingClass, number>;
  /** Unrounded percentages of route length. */
  exactPercent: Record<LightingClass, number>;
  /** Rounded to the configured step; always totals 100 for a non-empty route. */
  roundedPercent: Record<LightingClass, number>;
}

export interface RouteMetrics {
  distanceM: number;
  /** Estimated walking time at the configured speed. */
  durationS: number;
  lighting: LightingBreakdown;
  steps: { segments: number; metres: number };
  segmentsWalked: number;
}

export function computeRouteMetrics(
  graph: PedestrianGraph,
  pieces: RoutePiece[],
  options: { speedMps: number; percentStep: number },
): RouteMetrics {
  let distanceM = 0;
  const metres: Record<LightingClass, number> = { mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 0 };
  const stepsSegments = new Set<number>();
  let stepsMetres = 0;
  for (const piece of pieces) {
    const seg = graph.segments[piece.segment]!;
    const len = pieceLengthM(graph, piece);
    distanceM += len;
    const lit = lightingMetresInRange(seg, Math.min(piece.fromFrac, piece.toFrac), Math.max(piece.fromFrac, piece.toFrac));
    for (const cls of LIGHTING_CLASSES) metres[cls] += lit[cls];
    if (seg.tags.highway === 'steps') {
      stepsSegments.add(seg.id);
      stepsMetres += len;
    }
  }
  return {
    distanceM,
    durationS: distanceM / options.speedMps,
    lighting: {
      metres,
      exactPercent: exactShares(metres),
      roundedPercent: roundSharesToStep(metres, options.percentStep),
    },
    steps: { segments: stepsSegments.size, metres: stepsMetres },
    segmentsWalked: new Set(pieces.map((p) => p.segment)).size,
  };
}
