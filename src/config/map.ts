/**
 * Basemap configuration (light only).
 *
 * OpenFreeMap (https://openfreemap.org) publishes keyless MapLibre styles. The tiles are hosted by
 * OpenFreeMap, not by GitHub Pages; their attribution arrives with the TileJSON and is shown by
 * MapLibre's attribution control. Style URLs were checked on 2026-11-07.
 */
export interface BasemapCandidate {
  id: string;
  label: string;
  url: string;
}

/** Tried in order. Positron is tinted with the Solas palette; Liberty is the fallback. */
export const BASEMAP_CANDIDATES: BasemapCandidate[] = [
  { id: 'openfreemap-positron', label: 'OpenFreeMap Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'openfreemap-liberty', label: 'OpenFreeMap Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
];

/** How long to wait for a style document before trying the next candidate. */
export const STYLE_FETCH_TIMEOUT_MS = 8000;

/** Attribution for Solas's own routing data, shown alongside the basemap attribution. */
export const ROUTING_DATA_ATTRIBUTION =
  'Walking data <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL)';

/**
 * Initial camera before the dataset manifest loads: the OSM `place=city` node for Cork
 * (node 1422314245, fetched from Overpass on 2026-11-07). Once the dataset loads, the camera fits
 * the dataset's coverage bounds instead.
 */
export const INITIAL_VIEW = {
  center: [-8.4726423, 51.8985136] as [number, number],
  zoom: 14,
};

/** Background for the built-in offline style (Nourished, lightened). */
export const MAP_BACKGROUND = '#F4F1EA';
