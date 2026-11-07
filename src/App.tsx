import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Moon, Sun } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { IconButton } from './components/IconButton';
import { Notice } from './components/Notice';
import { MapView, type MapStatus } from './features/map/MapView';
import { CoverageOverlay } from './features/map/overlays/CoverageOverlay';
import { LandmarkOverlay } from './features/map/overlays/LandmarkOverlay';
import { RouteOverlay } from './features/map/overlays/RouteOverlay';
import { EndpointMarker } from './features/map/overlays/EndpointMarkers';
import { FitToBounds, FitToRoute } from './features/map/overlays/CameraEffects';
import { clampPadding, type Padding } from './features/map/camera';
import { EndpointField } from './features/planner/EndpointField';
import {
  endpointsFromHash,
  endpointsToHash,
  landmarkEndpoint,
  mapEndpoint,
  type Endpoint,
  type EndpointRole,
} from './features/planner/endpoints';
import { ResultsPanel } from './features/routes/ResultsPanel';
import { useDataset } from './hooks/useDataset';
import { useElementHeight } from './hooks/useElementHeight';
import { useGeolocation } from './hooks/useGeolocation';
import { useIsDesktop, usePrefersReducedMotion } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import type { LngLat } from './lib/graph/types';

const DESKTOP_PANEL_WIDTH = 420;

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const isDesktop = useIsDesktop();
  const reduceMotion = usePrefersReducedMotion();
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: 'loading' });
  const { state: dataset, retry } = useDataset();
  const manifest = dataset.status === 'loading-manifest' ? null : (dataset.manifest ?? null);
  const engine = dataset.status === 'ready' ? dataset.engine : null;
  const landmarks = useMemo(() => manifest?.landmarks ?? [], [manifest]);

  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [explicitPick, setExplicitPick] = useState<EndpointRole | null>(null);
  const [inputNotice, setInputNotice] = useState<{ role: EndpointRole; message: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { locating, locate } = useGeolocation();

  // Restore endpoints from a shared link once landmarks are known (adjusting state during render,
  // as React recommends for derived state), then mirror changes to the URL hash.
  const [hydrated, setHydrated] = useState(false);
  if (manifest && !hydrated) {
    setHydrated(true);
    const fromHash = endpointsFromHash(window.location.hash, manifest.landmarks);
    if (fromHash.origin) setOrigin(fromHash.origin);
    if (fromHash.destination) setDestination(fromHash.destination);
  }
  useEffect(() => {
    if (!hydrated) return;
    const hash = endpointsToHash(origin, destination);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [hydrated, origin, destination]);

  const pickTarget: EndpointRole | null = engine ? (explicitPick ?? (!origin ? 'origin' : !destination ? 'destination' : null)) : null;

  const setEndpoint = useCallback((role: EndpointRole, endpoint: Endpoint | null) => {
    if (role === 'origin') setOrigin(endpoint);
    else setDestination(endpoint);
    setInputNotice(null);
  }, []);

  const trySetPoint = useCallback(
    (role: EndpointRole, point: LngLat, make: () => Endpoint) => {
      if (!engine) return;
      const snap = engine.snap(point);
      if (!snap.ok) {
        setInputNotice({ role, message: snap.error.message });
        return;
      }
      setEndpoint(role, make());
      setExplicitPick(null);
    },
    [engine, setEndpoint],
  );

  const onMapClick = useCallback(
    (lngLat: [number, number], landmarkId?: string) => {
      if (!pickTarget) return;
      const lm = landmarkId ? landmarks.find((l) => l.id === landmarkId) : undefined;
      if (lm) {
        setEndpoint(pickTarget, landmarkEndpoint(lm));
        setExplicitPick(null);
        return;
      }
      trySetPoint(pickTarget, lngLat, () => mapEndpoint(lngLat));
    },
    [pickTarget, landmarks, setEndpoint, trySetPoint],
  );

  const onUseLocation = useCallback(async () => {
    const result = await locate();
    if (!result.ok) {
      setInputNotice({ role: 'origin', message: result.message });
      return;
    }
    trySetPoint('origin', result.point, () => ({ kind: 'location', point: result.point, label: 'My location', accuracyM: result.accuracyM }));
  }, [locate, trySetPoint]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
    setInputNotice(null);
  };

  const tryDemo = () => {
    const a = landmarks.find((l) => l.id === 'ucc-quad');
    const b = landmarks.find((l) => l.id === 'parnell-place');
    if (a && b) {
      setOrigin(landmarkEndpoint(a));
      setDestination(landmarkEndpoint(b));
      setExplicitPick(null);
      setInputNotice(null);
    }
  };

  const outcome = useMemo(
    () => (engine && origin && destination ? engine.planFastest(origin.point, destination.point) : null),
    [engine, origin, destination],
  );
  const routes = useMemo(() => (outcome?.ok ? outcome.routes : []), [outcome]);
  const selected = routes.find((r) => r.id === selectedId) ?? routes[0] ?? null;

  const fieldError = (role: EndpointRole): string | null => {
    if (inputNotice?.role === role) return inputNotice.message;
    if (outcome && !outcome.ok && outcome.error.kind === 'snap' && outcome.error.which === role) return outcome.error.failure.message;
    return null;
  };

  // Layout measurements keep routes clear of the floating panels.
  const [panelRef, panelHeight] = useElementHeight<HTMLDivElement>();
  const [sheetRef, sheetHeight] = useElementHeight<HTMLDivElement>();
  useEffect(() => {
    document.documentElement.style.setProperty('--sheet-offset', isDesktop ? '0px' : `${Math.round(sheetHeight)}px`);
  }, [isDesktop, sheetHeight]);
  const viewport = { w: typeof window !== 'undefined' ? window.innerWidth : 1024, h: typeof window !== 'undefined' ? window.innerHeight : 768 };
  const padding: Padding = clampPadding(
    isDesktop
      ? { top: 48, bottom: 48, left: DESKTOP_PANEL_WIDTH + 48, right: 72 }
      : { top: panelHeight + 28, bottom: sheetHeight + 28, left: 28, right: 28 },
    viewport.w,
    viewport.h,
  );

  const results = (
    <ResultsPanel
      dataset={dataset}
      onRetry={retry}
      hasEndpoints={Boolean(origin && destination)}
      outcome={outcome}
      selectedId={selected?.id ?? null}
      onSelect={setSelectedId}
      onTryDemo={landmarks.some((l) => l.id === 'ucc-quad') ? tryDemo : undefined}
    />
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-ink">
      <a href="#planner" className="sr-only-focusable absolute left-3 top-3 z-50 rounded-lg bg-accent px-3 py-2 font-semibold text-accent-contrast">
        Skip to route planner
      </a>

      <MapView
        theme={theme}
        onStatusChange={setMapStatus}
        onMapClick={onMapClick}
        ariaLabel={`Map of the supported Cork walking area. ${pickTarget ? `Tap to set the ${pickTarget === 'origin' ? 'start' : 'destination'}.` : ''}`}
      >
        {manifest && <CoverageOverlay coverage={manifest.coverage} theme={theme} />}
        {manifest && (
          <LandmarkOverlay landmarks={landmarks} theme={theme} hasGlyphs={mapStatus.kind === 'ready' && mapStatus.basemap.kind === 'remote'} />
        )}
        <RouteOverlay routes={routes} selectedId={selected?.id ?? null} theme={theme} />
        <EndpointMarker point={origin?.point ?? null} role="origin" label={origin?.label ?? ''} />
        <EndpointMarker point={destination?.point ?? null} role="destination" label={destination?.label ?? ''} />
        <FitToRoute route={selected} padding={padding} reduceMotion={reduceMotion} />
        {manifest && <FitToBounds bbox={manifest.coverage.bbox} padding={padding} />}
      </MapView>

      <aside
        id="planner"
        aria-label="Route planner"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 md:inset-y-0 md:right-auto md:p-4"
        style={isDesktop ? { width: DESKTOP_PANEL_WIDTH } : undefined}
      >
        <div
          ref={panelRef}
          className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-glass shadow-float backdrop-blur-xl"
        >
          <div className="space-y-3 p-3 sm:p-4">
            <header className="flex items-center gap-3">
              <BrandMark size={isDesktop ? 40 : 34} />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-extrabold leading-tight tracking-tight">Solas</h1>
                <p className="truncate text-sm text-ink-muted">The better walk is worth seeing.</p>
              </div>
              <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
              </IconButton>
            </header>

            <form className="relative space-y-2.5" aria-label="Choose start and destination" onSubmit={(e) => e.preventDefault()}>
              <EndpointField
                role="origin"
                endpoint={origin}
                landmarks={landmarks}
                disabled={!engine}
                picking={pickTarget === 'origin'}
                locating={locating}
                error={fieldError('origin')}
                onChange={(e) => setEndpoint('origin', e)}
                onTogglePick={() => setExplicitPick(pickTarget === 'origin' ? null : 'origin')}
                onUseLocation={onUseLocation}
              />
              <EndpointField
                role="destination"
                endpoint={destination}
                landmarks={landmarks}
                disabled={!engine}
                picking={pickTarget === 'destination'}
                error={fieldError('destination')}
                onChange={(e) => setEndpoint('destination', e)}
                onTogglePick={() => setExplicitPick(pickTarget === 'destination' ? null : 'destination')}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={swap}
                  disabled={!origin && !destination}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
                >
                  <ArrowUpDown className="size-4" aria-hidden="true" /> Swap start and destination
                </button>
              </div>
            </form>

            {mapStatus.kind === 'unsupported' && <Notice tone="error">{mapStatus.message}</Notice>}
            {mapStatus.kind === 'ready' && mapStatus.basemap.kind === 'offline' && (
              <Notice tone="warning" title="Basemap unavailable">
                Map tiles could not be loaded, so only Solas&apos;s own data is shown. Routes still work.
              </Notice>
            )}
            {mapStatus.kind === 'ready' && mapStatus.tilesDegraded && mapStatus.basemap.kind === 'remote' && (
              <Notice tone="warning">Some map tiles failed to load. Routes are unaffected.</Notice>
            )}
          </div>
          {isDesktop && <div className="min-h-0 flex-1 overflow-y-auto border-t border-line p-4">{results}</div>}
        </div>
      </aside>

      {pickTarget && (
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 md:left-[calc(50%+210px)]"
          style={{ top: isDesktop ? 20 : panelHeight + 20 }}
        >
          <p
            aria-live="polite"
            className="rounded-full border border-line bg-surface-glass px-4 py-2 text-sm font-semibold shadow-float backdrop-blur-xl"
          >
            Tap the map to set your {pickTarget === 'origin' ? 'start' : 'destination'}
          </p>
        </div>
      )}

      {!isDesktop && (
        <section aria-label="Routes" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
          <div
            ref={sheetRef}
            className="pointer-events-auto max-h-[46dvh] overflow-y-auto rounded-2xl border border-line bg-surface-glass p-3 shadow-float backdrop-blur-xl"
          >
            {results}
          </div>
        </section>
      )}
    </div>
  );
}
