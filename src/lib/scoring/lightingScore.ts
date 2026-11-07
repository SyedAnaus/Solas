import { ROUTING_CONFIG } from '../../config/routing';
import type { LightingBreakdown } from './metrics';

export interface LightingAssessment {
  /** Headline: share of length that is mapped lit OR likely lit (near a mapped lamp). Exact %. */
  litEvidencePct: number;
  /** Share of length with any lighting evidence (everything except unknown). */
  evidenceCoveragePct: number;
  mappedLitPct: number;
  likelyLitPct: number;
  mappedUnlitPct: number;
  unknownPct: number;
  /**
   * Ranking score: mapped% + likelyWeight × likely% − unlitWeight × unlit%. Unknown adds nothing
   * and subtracts nothing, because missing data is not evidence of darkness.
   */
  score: number;
}

type LightingConfig = typeof ROUTING_CONFIG.lighting;

export function assessLighting(lighting: LightingBreakdown, cfg: LightingConfig = ROUTING_CONFIG.lighting): LightingAssessment {
  const p = lighting.exactPercent;
  return {
    litEvidencePct: p.mapped_lit + p.likely_lit,
    evidenceCoveragePct: 100 - p.unknown,
    mappedLitPct: p.mapped_lit,
    likelyLitPct: p.likely_lit,
    mappedUnlitPct: p.mapped_unlit,
    unknownPct: p.unknown,
    score: p.mapped_lit + cfg.likelyWeight * p.likely_lit - cfg.unlitWeight * p.mapped_unlit,
  };
}

export type BetterLitRejection =
  | 'not-better' // no lighting gain at all
  | 'below-threshold' // gain smaller than the configured percentage points
  | 'too-sparse' // the alternative itself has too little lighting evidence
  | 'more-unlit' // it would add length that is mapped as unlit
  | 'over-cap'; // better lit, but longer than the user's detour limit

export interface BetterLitJudgement {
  /** Percentage-point gain in mapped-or-likely-lit share over the fastest route. */
  gainPts: number;
  scoreGain: number;
  extraS: number;
  /** Ranking value among qualifying candidates (higher is better). */
  utility: number;
  qualifies: boolean;
  /** Reasons it does not qualify. Empty when it qualifies; 'over-cap' may be the only reason. */
  rejections: BetterLitRejection[];
}

/**
 * Decide whether `candidate` is a meaningfully better-lit alternative to `fastest`.
 * Thresholds come from config and are heuristics, not facts.
 */
export function judgeBetterLit(
  fastest: { assessment: LightingAssessment; durationS: number },
  candidate: { assessment: LightingAssessment; durationS: number },
  maxExtraS: number,
  cfg: LightingConfig = ROUTING_CONFIG.lighting,
): BetterLitJudgement {
  const gainPts = candidate.assessment.litEvidencePct - fastest.assessment.litEvidencePct;
  const scoreGain = candidate.assessment.score - fastest.assessment.score;
  const extraS = Math.max(0, candidate.durationS - fastest.durationS);
  const rejections: BetterLitRejection[] = [];
  const eps = 1e-9;
  if (gainPts <= eps || scoreGain <= eps) rejections.push('not-better');
  else if (gainPts + eps < cfg.minImprovementPts) rejections.push('below-threshold');
  if (candidate.assessment.evidenceCoveragePct + eps < cfg.minEvidenceCoveragePct) rejections.push('too-sparse');
  if (candidate.assessment.mappedUnlitPct - fastest.assessment.mappedUnlitPct > cfg.maxUnlitIncreasePts + eps) {
    rejections.push('more-unlit');
  }
  if (extraS > maxExtraS + eps) rejections.push('over-cap');
  return {
    gainPts,
    scoreGain,
    extraS,
    utility: scoreGain - cfg.timeCostPtsPerMin * (extraS / 60),
    qualifies: rejections.length === 0,
    rejections,
  };
}
