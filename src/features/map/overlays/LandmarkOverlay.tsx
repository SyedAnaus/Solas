import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Landmark } from '../../../lib/graph/types';
import type { ThemeName } from '../../../config/map';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

export const LANDMARK_LAYER_ID = 'solas-landmarks-dot';

/** Verified landmarks from the dataset manifest, drawn at their OSM label points. */
export function LandmarkOverlay({ landmarks, theme, hasGlyphs }: { landmarks: Landmark[]; theme: ThemeName; hasGlyphs: boolean }) {
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
  const dark = theme === 'dark';
  const layers = useMemo<OverlayLayer[]>(() => {
    const dot: OverlayLayer = {
      id: LANDMARK_LAYER_ID,
      type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 7],
        'circle-color': dark ? '#0f1530' : '#ffffff',
        'circle-stroke-color': dark ? '#d7c8ff' : '#5636c4',
        'circle-stroke-width': 2,
      },
    };
    if (!hasGlyphs) return [dot];
    const label: OverlayLayer = {
      id: 'solas-landmarks-label',
      type: 'symbol',
      minzoom: 14,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': dark ? '#eef0fb' : '#121633',
        'text-halo-color': dark ? '#0b1029' : '#ffffff',
        'text-halo-width': 1.5,
      },
    };
    return [dot, label];
  }, [dark, hasGlyphs]);
  useGeoJsonLayers('solas-landmarks', data, layers, { belowLabels: false });
  return null;
}
