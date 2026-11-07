import { createContext, useContext } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface MapContextValue {
  map: MapLibreMap | null;
  /** Increments every time a style finishes loading, so overlays know to re-add their layers. */
  styleVersion: number;
}

export const MapContext = createContext<MapContextValue>({ map: null, styleVersion: 0 });

export function useMapContext(): MapContextValue {
  return useContext(MapContext);
}
