import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { PALETTE } from '../../../config/theme';
import type { Landmark } from '../../../lib/graph/types';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

export const LANDMARK_LAYER_ID = 'solas-landmarks-dot';

/** Verified landmarks from the dataset manifest, drawn at their OSM label points. */
export function LandmarkOverlay({ landmarks, hasGlyphs }: { landmarks: Landmark[]; hasGlyphs: boolean }) {
  const data = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: landmarks.map((l) => ({
        type: 'Feature',
        properties: { id: l.id, label: l.label },
        geometry: { type: 'Point', coordinates: l.labelPoint },
      })),
    }),
    [landmarks],
  );
  const layers = useMemo<OverlayLayer[]>(() => {
    const dot: OverlayLayer = {
      id: LANDMARK_LAYER_ID,
      type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 6],
        'circle-color': '#FFFFFF',
        'circle-stroke-color': PALETTE.brightSlate,
        'circle-stroke-width': 2,
      },
    };
    if (!hasGlyphs) return [dot];
    const label: OverlayLayer = {
      id: 'solas-landmarks-label',
      type: 'symbol',
      minzoom: 14.2,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11.5,
        'text-offset': [0, 1],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: { 'text-color': PALETTE.ink, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 },
    };
    return [dot, label];
  }, [hasGlyphs]);
  useGeoJsonLayers('solas-landmarks', data, layers, { belowLabels: false });
  return null;
}
