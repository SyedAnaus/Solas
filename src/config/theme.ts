/**
 * Solas visual language (light only). One source of truth for colours used by map layers;
 * CSS tokens in index.css mirror these values.
 *
 * Palette from the brand references:
 *   Nourished #EBE5D3 · Pow Orange #E05320 · Link Water #D3D9EB · Bright Slate #3B4497
 *
 * Two kinds of colour never mix:
 *  - Track colours identify a route (fastest vs preferred alternative).
 *  - Evidence colours describe lighting along the selected route, always paired with a line pattern.
 */
export const PALETTE = {
  nourished: '#EBE5D3',
  powOrange: '#E05320',
  linkWater: '#D3D9EB',
  brightSlate: '#3B4497',
  ink: '#14182E',
} as const;

/** Route identity. Selection is shown by width, halo, callout and card state, never by hue. */
export const TRACK = {
  fastest: { line: PALETTE.brightSlate, label: 'Slate route' },
  alternative: { line: PALETTE.powOrange, label: 'Orange route' },
} as const;

export type TrackKind = keyof typeof TRACK;

/**
 * Lighting evidence, drawn as a navy "tube" with an inner pattern:
 *   mapped lit = solid yellow · likely lit = mint dashes · unknown = white dots · mapped unlit = coral core.
 */
export const EVIDENCE = {
  tube: '#1F2350',
  litYellow: '#FFC629',
  likelyMint: '#8DE0C2',
  unknownDot: '#FFFFFF',
  unlitCore: '#F19A94',
} as const;

/** Basemap tints applied to OpenFreeMap Positron so the map sits in the same palette. */
export const BASEMAP_TINT: Record<string, { prop: string; value: string }> = {
  background: { prop: 'background-color', value: '#F4F1EA' },
  landuse_residential: { prop: 'fill-color', value: '#EFEBE1' },
  building: { prop: 'fill-color', value: '#E7E3D8' },
  park: { prop: 'fill-color', value: '#E2E9D7' },
  landcover_wood: { prop: 'fill-color', value: '#DCE5D0' },
  water: { prop: 'fill-color', value: '#C3CEEA' },
  waterway: { prop: 'line-color', value: '#B3C1E3' },
};
