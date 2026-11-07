import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { TRACK } from '../../../config/theme';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { trackOf } from '../track';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

export const ROUTE_HIT_LAYER_ID = 'solas-route-hit';

/**
 * Routes drawn from their real edge geometry. Identity = track colour. Selection = wider line,
 * dark halo and drawn on top; unselected routes stay full colour (for contrast) but thinner.
 */
export function RouteOverlay({ routes, selectedId, evidenceOn }: { routes: RouteCandidate[]; selectedId: string | null; evidenceOn: boolean }) {
  const data = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [...routes]
        .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
        .map((r) => ({
          type: 'Feature',
          properties: { id: r.id, selected: r.id === selectedId, color: TRACK[trackOf(r)].line },
          geometry: { type: 'LineString', coordinates: r.geometry.coordinates },
        })),
    }),
    [routes, selectedId],
  );

  const layers = useMemo<OverlayLayer[]>(
    () => [
      {
        id: 'solas-route-halo',
        type: 'line',
        filter: ['==', ['get', 'selected'], true],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1F2350', 'line-width': 15, 'line-opacity': 0.16, 'line-blur': 3 },
      },
      {
        id: 'solas-route-casing',
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['get', 'selected'], evidenceOn ? 17 : 11, 7.5] },
      },
      {
        id: 'solas-route-line',
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          // With lighting evidence on, the selected route keeps a track-coloured rim around the tube.
          'line-width': ['case', ['get', 'selected'], evidenceOn ? 13 : 7, 4],
          'line-opacity': ['case', ['get', 'selected'], 1, 0.92],
        },
      },
      {
        // Invisible, wide line so routes are easy to tap.
        id: ROUTE_HIT_LAYER_ID,
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': 0 },
      },
    ],
    [evidenceOn],
  );
  // Toggling evidence rebuilds these layers. Keep the route rim underneath the evidence
  // even when the evidence layers already exist, otherwise the solid track covers them.
  useGeoJsonLayers('solas-routes', data, layers, { beforeLayerId: 'solas-evidence-tube' });
  return null;
}
