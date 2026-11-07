/**
 * Every tunable routing and scoring number lives here. UI code must not hard-code these.
 * Values are starting heuristics for a hackathon prototype, not validated safety thresholds.
 */
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

  /** Two candidates sharing at least this share of length are treated as the same route. */
  duplicateOverlapRatio: 0.9,

  /** PRD heuristic: an alternative must improve mapped lighting by at least this many points. */
  minLightingImprovementPts: 10,

  /** PRD heuristic: default cap on extra minutes over the fastest route. User-adjustable. */
  defaultMaxDetourMin: 10,
  maxDetourOptionsMin: [3, 5, 10, 15, 20] as const,

  /** Percentages shown in the UI are rounded to this step (PRD: nearest 5 points). */
  percentRoundingStep: 5,

  /** Better-lit search: cost multipliers per metre of each lighting class (all >= 1). */
  lighting: {
    /** Penalty families tried to generate candidate routes, from gentle to strong. */
    penaltyProfiles: [
      { mapped_lit: 1, likely_lit: 1.15, unknown: 1.6, mapped_unlit: 2.5 },
      { mapped_lit: 1, likely_lit: 1.3, unknown: 2.5, mapped_unlit: 4 },
      { mapped_lit: 1, likely_lit: 1.6, unknown: 4, mapped_unlit: 8 },
    ],
  },
} as const;

export type RoutingConfig = typeof ROUTING_CONFIG;
