import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import type { ThemeName } from '../../../config/map';
import type { LngLat } from '../../../lib/graph/types';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { mergeStretches } from '../../../lib/scoring/evidence';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

/**
 * Lighting evidence drawn inside the selected route line. Each class has its own line pattern
 * (solid, dashed, dark core, dotted) as well as colour, matching the legend in the panel.
 */
export function EvidenceOverlay({
  route,
  lampCoords,
  theme,
}: {
  route: RouteCandidate | null;
  lampCoords: Map<number, LngLat>;
  theme: ThemeName;
}) {
  const data = useMemo<FeatureCollection>(() => {
    if (!route) return { type: 'FeatureCollection', features: [] };
    const lines = mergeStretches(route.evidence).map((s) => ({
      type: 'Feature' as const,
      properties: { kind: 'line', cls: s.cls },
      geometry: { type: 'LineString' as const, coordinates: s.coords },
    }));
    const lampIds = new Set<number>();
    for (const s of route.evidence) for (const id of s.lamps ?? []) lampIds.add(id);
    const lamps = [...lampIds].flatMap((id) => {
      const c = lampCoords.get(id);
      return c ? [{ type: 'Feature' as const, properties: { kind: 'lamp', id }, geometry: { type: 'Point' as const, coordinates: c } }] : [];
    });
    return { type: 'FeatureCollection', features: [...lines, ...lamps] };
  }, [route, lampCoords]);

  const dark = theme === 'dark';
  const layers = useMemo<OverlayLayer[]>(() => {
    const lineBase = (cls: string, paint: Record<string, unknown>): OverlayLayer =>
      ({
        id: `solas-evidence-${cls}`,
        type: 'line',
        filter: ['all', ['==', ['get', 'kind'], 'line'], ['==', ['get', 'cls'], cls]],
        layout: { 'line-join': 'round', 'line-cap': cls === 'unknown' ? 'round' : 'butt' },
        paint,
      }) as OverlayLayer;
    return [
      lineBase('mapped_lit', { 'line-color': '#f8c15c', 'line-width': 3.5 }),
      lineBase('likely_lit', { 'line-color': '#f8c15c', 'line-width': 3.5, 'line-dasharray': [1.6, 1.1] }),
      lineBase('mapped_unlit', { 'line-color': '#05060d', 'line-width': 3.5 }),
      lineBase('unknown', { 'line-color': dark ? '#e3e6f7' : '#ffffff', 'line-width': 2.6, 'line-dasharray': [0.1, 1.9] }),
      {
        id: 'solas-evidence-lamps',
        type: 'circle',
        minzoom: 14.5,
        filter: ['==', ['get', 'kind'], 'lamp'],
        paint: {
          'circle-radius': 3,
          'circle-color': '#f8c15c',
          'circle-stroke-color': dark ? '#0b1029' : '#5a3d00',
          'circle-stroke-width': 1,
          'circle-opacity': 0.9,
        },
      },
    ];
  }, [dark]);

  useGeoJsonLayers('solas-evidence', data, layers);
  return null;
}
