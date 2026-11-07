import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { EVIDENCE } from '../../../config/theme';
import type { LngLat } from '../../../lib/graph/types';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { mergeStretches } from '../../../lib/scoring/evidence';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

/**
 * Lighting evidence for the selected route, drawn as a navy tube with an inner pattern:
 * mapped lit = solid yellow, likely lit = mint dashes, unknown = white dots,
 * mapped unlit = coral core. The patterns match the legend and the bars in the panel.
 */
export function EvidenceOverlay({ route, lampCoords }: { route: RouteCandidate | null; lampCoords: Map<number, LngLat> }) {
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

  const layers = useMemo<OverlayLayer[]>(() => {
    const inner = (cls: string, paint: Record<string, unknown>, cap: 'butt' | 'round' = 'butt'): OverlayLayer =>
      ({
        id: `solas-evidence-${cls}`,
        type: 'line',
        filter: ['all', ['==', ['get', 'kind'], 'line'], ['==', ['get', 'cls'], cls]],
        layout: { 'line-join': 'round', 'line-cap': cap },
        paint,
      }) as OverlayLayer;
    return [
      {
        id: 'solas-evidence-tube',
        type: 'line',
        filter: ['==', ['get', 'kind'], 'line'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': EVIDENCE.tube, 'line-width': 9 },
      },
      inner('mapped_lit', { 'line-color': EVIDENCE.litYellow, 'line-width': 4.5 }),
      inner('likely_lit', { 'line-color': EVIDENCE.likelyMint, 'line-width': 4.5, 'line-dasharray': [1.5, 1.2] }),
      inner('mapped_unlit', { 'line-color': EVIDENCE.unlitCore, 'line-width': 4.5 }),
      inner('unknown', { 'line-color': EVIDENCE.unknownDot, 'line-width': 3, 'line-dasharray': [0.1, 2] }, 'round'),
      {
        id: 'solas-evidence-lamps',
        type: 'circle',
        minzoom: 15,
        filter: ['==', ['get', 'kind'], 'lamp'],
        paint: {
          'circle-radius': 3.5,
          'circle-color': EVIDENCE.litYellow,
          'circle-stroke-color': EVIDENCE.tube,
          'circle-stroke-width': 1.5,
        },
      },
    ];
  }, []);

  useGeoJsonLayers('solas-evidence', data, layers);
  return null;
}
