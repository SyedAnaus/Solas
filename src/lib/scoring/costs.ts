import type { PieceCost } from '../graph/search';
import type { LightingClass, Segment } from '../graph/types';

/** Metres of each lighting class inside the fraction range [lo, hi] of a segment. */
export function lightingMetresInRange(segment: Segment, lo: number, hi: number): Record<LightingClass, number> {
  const out: Record<LightingClass, number> = { mapped_lit: 0, likely_lit: 0, mapped_unlit: 0, unknown: 0 };
  for (const interval of segment.light) {
    const overlap = Math.min(hi, interval.to) - Math.max(lo, interval.from);
    if (overlap > 0) out[interval.cls] += overlap * segment.length;
  }
  return out;
}

export type LightingMultipliers = Record<LightingClass, number>;

export interface CostProfile {
  speedMps: number;
  /** Per-metre multipliers by lighting class; omit for plain walking time. All must be >= 1. */
  lighting?: LightingMultipliers;
  /** Segments for which this returns true are never used (hard exclusion). */
  exclude?: (segment: Segment) => boolean;
}

/**
 * Build a cost function measured in (penalised) seconds. Multipliers are clamped to >= 1 so the
 * straight-line A* heuristic (distance / speed) stays admissible.
 */
export function makeCost(profile: CostProfile): PieceCost {
  if (!(profile.speedMps > 0) || !Number.isFinite(profile.speedMps)) throw new Error('speed must be positive');
  const lighting = profile.lighting;
  if (lighting) {
    for (const [cls, m] of Object.entries(lighting)) {
      if (!(m >= 1) || !Number.isFinite(m)) throw new Error(`lighting multiplier for ${cls} must be a finite number >= 1`);
    }
  }
  return (segment, fromFrac, toFrac) => {
    if (profile.exclude?.(segment)) return Infinity;
    const lo = Math.min(fromFrac, toFrac);
    const hi = Math.max(fromFrac, toFrac);
    if (!lighting) return ((hi - lo) * segment.length) / profile.speedMps;
    const metres = lightingMetresInRange(segment, lo, hi);
    let weighted = 0;
    for (const cls of Object.keys(metres) as LightingClass[]) weighted += metres[cls] * lighting[cls];
    return weighted / profile.speedMps;
  };
}
