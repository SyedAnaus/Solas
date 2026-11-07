import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibreWorker';
import { INITIAL_VIEW, ROUTING_DATA_ATTRIBUTION, type ThemeName } from '../../config/map';
import { resolveBasemapStyle, type BasemapSource } from './resolveStyle';
import { MapContext } from './MapContext';

export type MapStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; basemap: BasemapSource; warnings: string[]; tilesDegraded: boolean }
  | { kind: 'unsupported'; message: string };

interface MapViewProps {
  theme: ThemeName;
  onStatusChange?: (status: MapStatus) => void;
  onMapClick?: (lngLat: [number, number]) => void;
  /** Accessible description of the map for screen readers. */
  ariaLabel: string;
  children?: ReactNode;
}

export function MapView({ theme, onStatusChange, onMapClick, ariaLabel, children }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const themeRef = useRef(theme);
  const statusRef = useRef(onStatusChange);
  const clickRef = useRef(onMapClick);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const basemapRef = useRef<{ source: BasemapSource; warnings: string[]; tilesDegraded: boolean } | null>(null);

  useEffect(() => {
    statusRef.current = onStatusChange;
    clickRef.current = onMapClick;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    statusRef.current?.({ kind: 'loading' });

    void resolveBasemapStyle(themeRef.current).then((resolved) => {
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
          cooperativeGestures: false,
        });
      } catch (error) {
        statusRef.current?.({
          kind: 'unsupported',
          message:
            error instanceof Error && /webgl/i.test(error.message)
              ? 'This browser or device cannot draw the map (WebGL is unavailable).'
              : 'The map could not start on this device.',
        });
        return;
      }

      basemapRef.current = { source: resolved.source, warnings: resolved.warnings, tilesDegraded: false };
      instance.addControl(new AttributionControl({ compact: false, customAttribution: ROUTING_DATA_ATTRIBUTION }), 'bottom-right');
      instance.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
      instance.touchZoomRotate.disableRotation();

      const emitReady = () => {
        const b = basemapRef.current;
        if (b) statusRef.current?.({ kind: 'ready', basemap: b.source, warnings: b.warnings, tilesDegraded: b.tilesDegraded });
      };

      instance.on('style.load', () => {
        setStyleVersion((v) => v + 1);
      });
      instance.on('load', emitReady);
      instance.on('error', (event) => {
        // Tile or source failures should not break routing; flag them once.
        const b = basemapRef.current;
        const sourceId = (event as { sourceId?: string }).sourceId;
        if (b && sourceId && !b.tilesDegraded) {
          b.tilesDegraded = true;
          emitReady();
        }
      });
      instance.on('click', (event) => {
        clickRef.current?.([event.lngLat.lng, event.lngLat.lat]);
      });

      mapRef.current = instance;
      setMap(instance);
    });

    return () => {
      cancelled = true;
      instance?.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  // Switch basemap when the theme changes.
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    const instance = mapRef.current;
    if (!instance) return;
    let cancelled = false;
    void resolveBasemapStyle(theme).then((resolved) => {
      if (cancelled || mapRef.current !== instance) return;
      basemapRef.current = { source: resolved.source, warnings: resolved.warnings, tilesDegraded: false };
      instance.setStyle(resolved.style, { diff: false });
      instance.once('style.load', () => {
        const b = basemapRef.current;
        if (b) statusRef.current?.({ kind: 'ready', basemap: b.source, warnings: b.warnings, tilesDegraded: false });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [theme]);

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
