import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import type { CoverageArea } from '../../../lib/graph/types';
import type { ThemeName } from '../../../config/map';
import { useGeoJsonLayers } from './useGeoJsonLayers';

/** Dashed outline of the area Solas has walking data for, with the outside gently dimmed. */
export function CoverageOverlay({ coverage, theme }: { coverage: CoverageArea; theme: ThemeName }) {
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

  const dark = theme === 'dark';
  useGeoJsonLayers('solas-coverage', data, [
    {
      id: 'solas-coverage-mask',
      type: 'fill',
      filter: ['==', ['get', 'role'], 'mask'],
      paint: { 'fill-color': dark ? '#04060f' : '#1b1f3b', 'fill-opacity': dark ? 0.45 : 0.12 },
    },
    {
      id: 'solas-coverage-outline',
      type: 'line',
      filter: ['==', ['get', 'role'], 'outline'],
      paint: { 'line-color': dark ? '#b79cff' : '#5636c4', 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [3, 2] },
    },
  ]);
  return null;
}
