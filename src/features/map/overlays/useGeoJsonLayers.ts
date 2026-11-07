import { useEffect, useRef } from 'react';
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useMapContext } from '../MapContext';

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Id of the first label layer, so our lines sit under street names rather than over them. */
function firstSymbolLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type OverlayLayer = DistributiveOmit<Exclude<LayerSpecification, { type: 'background' }>, 'source'>;

/**
 * Keep a GeoJSON source and its layers on the map. Re-adds them after every style change (theme
 * switch or basemap fallback) or when the layer definitions change, and updates data in place.
 * Pass memoised `layers` so they are not re-created on every render.
 */
export function useGeoJsonLayers(
  sourceId: string,
  data: FeatureCollection | null,
  layers: OverlayLayer[],
  options: { belowLabels?: boolean } = {},
): void {
  const { map, styleVersion } = useMapContext();
  const belowLabels = options.belowLabels ?? true;
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: dataRef.current ?? EMPTY_FC });
    }
    const before = belowLabels ? firstSymbolLayerId(map) : undefined;
    for (const layer of layers) {
      if (!map.getLayer(layer.id)) {
        map.addLayer({ ...layer, source: sourceId } as LayerSpecification, before && map.getLayer(before) ? before : undefined);
      }
    }
    return () => {
      // The map may already be gone or mid-style-swap; removal is best effort.
      try {
        if (!map.getStyle()) return;
        for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        /* style already replaced */
      }
    };
  }, [map, styleVersion, sourceId, layers, belowLabels]);

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data ?? EMPTY_FC);
  }, [map, styleVersion, sourceId, data]);
}
