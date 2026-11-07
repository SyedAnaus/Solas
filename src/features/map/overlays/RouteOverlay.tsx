import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import type { ThemeName } from '../../../config/map';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

/**
 * Draws route candidates from their real edge geometry. The selected route is emphasised;
 * others are dimmed and thinner. Route colours are lavender, kept distinct from the amber/teal
 * used for evidence.
 */
export function RouteOverlay({ routes, selectedId, theme }: { routes: RouteCandidate[]; selectedId: string | null; theme: ThemeName }) {
  const data = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      // Selected route last so it draws on top.
      features: [...routes]
        .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
        .map((r) => ({
          type: 'Feature',
          properties: { id: r.id, selected: r.id === selectedId },
          geometry: { type: 'LineString', coordinates: r.geometry.coordinates },
        })),
    }),
    [routes, selectedId],
  );

  const dark = theme === 'dark';
  const layers = useMemo<OverlayLayer[]>(
    () => [
      {
        id: 'solas-route-casing',
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': dark ? '#05071a' : '#ffffff',
          'line-width': ['case', ['get', 'selected'], 11, 7],
          'line-opacity': ['case', ['get', 'selected'], 0.95, 0.7],
        },
      },
      {
        id: 'solas-route-line',
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['case', ['get', 'selected'], dark ? '#b79cff' : '#6a4bd6', dark ? '#6f6a99' : '#a7a3c7'],
          'line-width': ['case', ['get', 'selected'], 6, 4],
          'line-opacity': ['case', ['get', 'selected'], 1, 0.85],
        },
      },
    ],
    [dark],
  );
  useGeoJsonLayers('solas-routes', data, layers);
  return null;
}
