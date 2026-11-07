/**
 * Every tunable routing and scoring number lives here. UI code must not hard-code these.
 * Values are starting heuristics for a hackathon prototype, not validated safety thresholds.
 */

/** Per-metre cost multipliers by lighting class. All >= 1 so the A* heuristic stays admissible. */
export interface LightingPenalty {
  mapped_lit: number;
  likely_lit: number;
  unknown: number;
  mapped_unlit: number;
}

export type LightingEmphasis = 'gentle' | 'balanced' | 'strong';

export const ROUTING_CONFIG = {
  /** Walking speed used for all time estimates (m/s). 1.3 m/s ≈ 4.7 km/h. Shown as an estimate. */
  walkingSpeedMps: 1.3,

  /** A tapped point further than this from the walking network is rejected, not guessed. */
  maxSnapDistanceM: 75,

  /**
   * Indoor passages (highway=corridor, indoor=yes) run through buildings with opening hours that
   * OSM rarely records, so routes avoid them by default.
   */
  excludeIndoor: true,

  /** Start and destination closer than this are treated as the same place. */
  minTripDistanceM: 15,

  /** Grid cell size for the nearest-edge index (metres). */
  spatialIndexCellM: 60,

  /** Two routes sharing at least this share of the longer route's length are the same route. */
  duplicateOverlapRatio: 0.9,

  /** Percentages shown in the UI are rounded to this step (PRD: nearest 5 points). */
  percentRoundingStep: 5,

  detour: {
    /** PRD heuristic: default cap on extra minutes over the fastest route. User-adjustable. */
    defaultMaxMin: 10,
    optionsMin: [3, 5, 10, 15, 20] as const,
  },

  lighting: {
    /**
     * PRD heuristic: an alternative is only offered as "better lit" if its share of
     * mapped-or-likely-lit length is at least this many percentage points above the fastest route.
     */
    minImprovementPts: 10,
    /**
     * An alternative must have lighting evidence (any class except unknown) on at least this share
     * of its length. Below that the data is too sparse to claim it is better lit.
     */
    minEvidenceCoveragePct: 50,
    /** An alternative may not add more than this many points of length mapped as unlit. */
    maxUnlitIncreasePts: 0,
    /**
     * Ranking among qualifying alternatives (never a filter): lighting score gain minus
     * `timeCostPtsPerMin` per extra minute. Score = mapped_lit% + likelyWeight × likely_lit%
     * − unlitWeight × mapped_unlit%. Unknown counts 0: it is not treated as dark.
     */
    likelyWeight: 0.6,
    unlitWeight: 1,
    timeCostPtsPerMin: 1.5,
    /** Warn when at least this share of a route has no lighting information. */
    unknownWarningPct: 30,
    /**
     * Penalty families used to generate candidate routes. Unknown is always penalised less than
     * known darkness, and the families vary the weight on uncertainty vs darkness.
     */
    penaltyProfiles: {
      gentle: [
        { mapped_lit: 1, likely_lit: 1.1, unknown: 1.35, mapped_unlit: 2 },
        { mapped_lit: 1, likely_lit: 1, unknown: 1.15, mapped_unlit: 3 },
      ],
      balanced: [
        { mapped_lit: 1, likely_lit: 1.1, unknown: 1.35, mapped_unlit: 2 },
        { mapped_lit: 1, likely_lit: 1.25, unknown: 2, mapped_unlit: 4 },
        { mapped_lit: 1, likely_lit: 1, unknown: 1.6, mapped_unlit: 6 },
        { mapped_lit: 1, likely_lit: 1.5, unknown: 3, mapped_unlit: 6 },
      ],
      strong: [
        { mapped_lit: 1, likely_lit: 1.25, unknown: 2, mapped_unlit: 4 },
        { mapped_lit: 1, likely_lit: 1.5, unknown: 3, mapped_unlit: 6 },
        { mapped_lit: 1, likely_lit: 2, unknown: 4.5, mapped_unlit: 9 },
      ],
    } satisfies Record<LightingEmphasis, LightingPenalty[]>,
  },

  /**
   * Easier walking and step-free routing. Only OSM tags are used; there is no elevation model, so
   * Solas never shows slope figures. `incline` tags are used qualitatively ("mapped as steep").
   */
  accessibility: {
    surfaceClasses: {
      smooth: ['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'chipseal', 'metal', 'linoleum', 'tartan', 'rubber'],
      moderate: ['fine_gravel', 'compacted', 'wood', 'grass_paver', 'bricks', 'paving_stones:lanes'],
      rough: ['sett', 'cobblestone', 'unhewn_cobblestone', 'pebblestone', 'gravel', 'dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'rock', 'woodchips', 'unpaved', 'stepping_stones'],
    },
    /** Per-metre cost multipliers (all >= 1). Unknown surface gets a small uncertainty penalty only. */
    surfaceMultiplier: { smooth: 1, moderate: 1.3, rough: 2, unknown: 1.05 },
    smoothnessMultiplier: { excellent: 1, good: 1, intermediate: 1.15, bad: 1.6, very_bad: 2.5, horrible: 3, very_horrible: 3, impassable: 4 } as Record<string, number>,
    /** OSM incline tags at or above these absolute percentages count as steep / moderately steep. */
    steepInclinePct: 8,
    moderateInclinePct: 5,
    inclineMultiplier: { steep: 1.8, moderate: 1.3, directionOnly: 1.1 },
    stepsMultiplier: 6,
    wheelchairLimitedMultiplier: 1.3,
    maxSegmentMultiplier: 10,
    /** Easier routing searches with these exponents applied to the effort multiplier. */
    easierExponents: [1, 2] as readonly number[],
    easier: {
      /** An easier alternative must remove a flight of steps or at least this much difficult length. */
      minDifficultReductionM: 20,
      /** Ranking: metres of difficult walking avoided, minus this many metres per extra minute. */
      timeCostMPerMin: 15,
    },
    stepFree: {
      /** Node barriers that block step-free travel when mapped. Gates are not blocked (often open). */
      blockedBarriers: ['stile', 'kissing_gate', 'turnstile', 'full-height_turnstile', 'step', 'steps', 'cattle_grid', 'log', 'block'],
      blockedKerbs: ['raised'],
      /** Mapped kerb heights above this (metres) block step-free travel. */
      maxKerbHeightM: 0.03,
    },
  },
} as const;

export type RoutingConfig = typeof ROUTING_CONFIG;
