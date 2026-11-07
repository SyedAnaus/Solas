import { ROUTING_CONFIG, type LightingEmphasis } from '../../config/routing';

export type RouteMode = 'fastest' | 'better_lit' | 'easier' | 'step_free';
export type RouteRole = RouteMode;

export interface RoutePreferences {
  /** Which route Solas recommends and selects. All modes still show the fastest route for comparison. */
  mode: RouteMode;
  /** Optional alternatives may add at most this many minutes over the fastest route. */
  maxDetourMin: number;
  /** When on, one alternative beyond the cap may be shown, always with an explicit warning. */
  showLongerAlternatives: boolean;
  /** Which family of lighting penalties generates better-lit candidates. */
  lightingEmphasis: LightingEmphasis;
}

export const DEFAULT_PREFERENCES: RoutePreferences = {
  mode: 'better_lit',
  maxDetourMin: ROUTING_CONFIG.detour.defaultMaxMin,
  showLongerAlternatives: false,
  lightingEmphasis: 'balanced',
};

export const MODE_LABEL: Record<RouteMode, string> = {
  fastest: 'Fastest',
  better_lit: 'Better lit',
  easier: 'Easier walking',
  step_free: 'Step-free',
};
