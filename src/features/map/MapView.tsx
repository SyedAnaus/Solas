import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibreWorker';
import { INITIAL_VIEW, ROUTING_DATA_ATTRIBUTION } from '../../config/map';
import { resolveBasemapStyle, type BasemapSource } from './resolveStyle';
import { MapContext } from './MapContext';
import { LANDMARK_LAYER_ID } from './overlays/LandmarkOverlay';
import { ROUTE_HIT_LAYER_ID } from './overlays/RouteOverlay';

export type MapStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; basemap: BasemapSource; warnings: string[]; tilesDegraded: boolean }
  | { kind: 'unsupported'; message: string };

export interface MapHit {
  landmarkId?: string;
  routeId?: string;
}

interface MapViewProps {
  onStatusChange?: (status: MapStatus) => void;
  onMapClick?: (lngLat: [number, number], hit: MapHit) => void;
  /** Accessible description of the map for screen readers. */
  ariaLabel: string;
  children?: ReactNode;
}

const HIT_LAYERS = [LANDMARK_LAYER_ID, ROUTE_HIT_LAYER_ID];

export function MapView({ onStatusChange, onMapClick, ariaLabel, children }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatusChange);
  const clickRef = useRef(onMapClick);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    statusRef.current = onStatusChange;
    clickRef.current = onMapClick;
  });

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    statusRef.current?.({ kind: 'loading' });

    void resolveBasemapStyle().then((resolved) => {
      if (cancelled || !containerRef.current) return;
      try {
        instance = new MapLibreMap({
          container: containerRef.current,
          style: resolved.style,
          center: INITIAL_VIEW.center,
          zoom: INITIAL_VIEW.zoom,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
      } catch (error) {
        statusRef.current?.({
          kind: 'unsupported',
          message:
            error instanceof Error && /webgl/i.test(error.message)
              ? 'This browser or device cannot draw the map (WebGL is unavailable). Routes can still be planned from the list.'
              : 'The map could not start on this device. Routes can still be planned from the list.',
        });
        return;
      }

      const basemap = { source: resolved.source, warnings: resolved.warnings, tilesDegraded: false };
      instance.addControl(new AttributionControl({ compact: false, customAttribution: ROUTING_DATA_ATTRIBUTION }), 'bottom-right');
      instance.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
      instance.touchZoomRotate.disableRotation();
      const emitReady = () => statusRef.current?.({ kind: 'ready', basemap: basemap.source, warnings: basemap.warnings, tilesDegraded: basemap.tilesDegraded });

      instance.on('style.load', () => setStyleVersion((v) => v + 1));
      instance.on('load', emitReady);
      instance.on('error', (event) => {
        const sourceId = (event as { sourceId?: string }).sourceId;
        if (sourceId && !sourceId.startsWith('solas-') && !basemap.tilesDegraded) {
          basemap.tilesDegraded = true;
          emitReady();
        }
      });
      instance.on('click', (event) => {
        // A finger-sized box makes thin lines and small dots easy to hit on touch screens.
        const { x, y } = event.point;
        const layers = HIT_LAYERS.filter((id) => instance?.getLayer(id));
        const features = layers.length
          ? (instance?.queryRenderedFeatures(
              [
                [x - 14, y - 14],
                [x + 14, y + 14],
              ],
              { layers },
            ) ?? [])
          : [];
        const hit: MapHit = {};
        for (const f of features) {
          const id = f.properties?.id;
          if (typeof id !== 'string') continue;
          if (f.layer.id === LANDMARK_LAYER_ID && !hit.landmarkId) hit.landmarkId = id;
          if (f.layer.id === ROUTE_HIT_LAYER_ID && !hit.routeId) hit.routeId = id;
        }
        clickRef.current?.([event.lngLat.lng, event.lngLat.lat], hit);
      });
      instance.on('mousemove', (event) => {
        const layers = HIT_LAYERS.filter((id) => instance?.getLayer(id));
        if (!layers.length || !instance) return;
        const over = instance.queryRenderedFeatures(event.point, { layers }).length > 0;
        instance.getCanvas().style.cursor = over ? 'pointer' : '';
      });

      setMap(instance);
    });

    return () => {
      cancelled = true;
      instance?.remove();
      setMap(null);
    };
  }, []);

  return (
    <MapContext.Provider value={{ map, styleVersion }}>
      {/* MapLibre's stylesheet forces `position: relative` on the container, so the wrapper owns positioning. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" role="region" aria-label={ariaLabel} data-testid="map-container" />
      </div>
      {children}
    </MapContext.Provider>
  );
}
