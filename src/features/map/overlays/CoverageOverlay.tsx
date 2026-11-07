import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { PALETTE } from '../../../config/theme';
import type { CoverageArea } from '../../../lib/graph/types';
import { useGeoJsonLayers, type OverlayLayer } from './useGeoJsonLayers';

/** Dashed outline of the area Solas has walking data for, with the outside gently veiled. */
export function CoverageOverlay({ coverage }: { coverage: CoverageArea }) {
  const data = useMemo<FeatureCollection>(() => {
    const [w, s, e, n] = coverage.bbox;
    const pad = 0.5;
    const world = [
      [w - pad, s - pad],
      [e + pad, s - pad],
      [e + pad, n + pad],
      [w - pad, n + pad],
      [w - pad, s - pad],
    ];
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { role: 'mask' }, geometry: { type: 'Polygon', coordinates: [world, [...coverage.coordinates[0]!].reverse()] } },
        { type: 'Feature', properties: { role: 'outline' }, geometry: { type: 'LineString', coordinates: coverage.coordinates[0]! } },
      ],
    };
  }, [coverage]);

  const layers = useMemo<OverlayLayer[]>(
    () => [
      {
        id: 'solas-coverage-mask',
        type: 'fill',
        filter: ['==', ['get', 'role'], 'mask'],
        paint: { 'fill-color': '#E9EDF6', 'fill-opacity': 0.55 },
      },
      {
        id: 'solas-coverage-outline',
        type: 'line',
        filter: ['==', ['get', 'role'], 'outline'],
        paint: { 'line-color': PALETTE.brightSlate, 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [3, 2] },
      },
    ],
    [],
  );
  useGeoJsonLayers('solas-coverage', data, layers);
  return null;
}
