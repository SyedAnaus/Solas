import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Moon, Pencil, Sun } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { IconButton } from './components/IconButton';
import { Notice } from './components/Notice';
import { MapView, type MapStatus } from './features/map/MapView';
import { CoverageOverlay } from './features/map/overlays/CoverageOverlay';
import { LandmarkOverlay } from './features/map/overlays/LandmarkOverlay';
import { RouteOverlay } from './features/map/overlays/RouteOverlay';
import { EvidenceOverlay } from './features/map/overlays/EvidenceOverlay';
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
import { FineTune, ModeSelector } from './features/preferences/PreferencePanel';
import { ResultsPanel } from './features/routes/ResultsPanel';
import { useDataset } from './hooks/useDataset';
import { useElementHeight } from './hooks/useElementHeight';
import { useGeolocation } from './hooks/useGeolocation';
import { useIsDesktop, usePrefersReducedMotion } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import type { LngLat } from './lib/graph/types';
import { planRoutes, type PlanResult } from './lib/routing/planner';
import { DEFAULT_PREFERENCES, type RouteMode, type RoutePreferences } from './lib/routing/preferences';

const DESKTOP_PANEL_WIDTH = 440;
/** Modes the planner implements in this build. */
const AVAILABLE_MODES: RouteMode[] = ['fastest', 'better_lit', 'easier', 'step_free'];

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const isDesktop = useIsDesktop();
  const reduceMotion = usePrefersReducedMotion();
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: 'loading' });
  const { state: dataset, retry } = useDataset();
  const manifest = dataset.status === 'loading-manifest' ? null : (dataset.manifest ?? null);
  const engine = dataset.status === 'ready' ? dataset.engine : null;
  const landmarks = useMemo(() => manifest?.landmarks ?? [], [manifest]);
  const lampCoords = useMemo(() => new Map<number, LngLat>(engine?.graph.lamps.map((l) => [l.id, l.coord]) ?? []), [engine]);

  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [explicitPick, setExplicitPick] = useState<EndpointRole | null>(null);
  const [inputNotice, setInputNotice] = useState<{ role: EndpointRole; message: string } | null>(null);
  const [prefs, setPrefs] = useState<RoutePreferences>(DEFAULT_PREFERENCES);
  const [showEvidence, setShowEvidence] = useState(true);
  const [editingEndpoints, setEditingEndpoints] = useState(false);
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
  // A link pasted into an already-open tab changes only the hash; follow it.
  useEffect(() => {
    if (!manifest) return;
    const onHashChange = () => {
      const fromHash = endpointsFromHash(window.location.hash, manifest.landmarks);
      setOrigin(fromHash.origin);
      setDestination(fromHash.destination);
      setInputNotice(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [manifest]);

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

  const outcome: PlanResult | null = useMemo(
    () => (engine && origin && destination ? planRoutes(engine, origin.point, destination.point, prefs) : null),
    [engine, origin, destination, prefs],
  );
  const routes = useMemo(() => (outcome?.ok ? outcome.routes : []), [outcome]);

  // Selection follows the recommendation whenever the plan changes (new endpoints or preferences),
  // and the user's explicit choice otherwise.
  const [choice, setChoice] = useState<{ plan: PlanResult | null; id: string | null }>({ plan: null, id: null });
  if (choice.plan !== outcome) setChoice({ plan: outcome, id: null });
  const recommendedId = outcome?.ok ? outcome.recommendedId : null;
  const selected = routes.find((r) => r.id === choice.id) ?? routes.find((r) => r.id === recommendedId) ?? routes[0] ?? null;
  const selectRoute = (id: string) => setChoice({ plan: outcome, id });

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

  const compactPlanner = !isDesktop && Boolean(origin && destination) && !editingEndpoints && outcome?.ok === true;

  const results = (
    <div className="space-y-3">
      {engine && origin && destination && (
        <>
          <ModeSelector prefs={prefs} onChange={setPrefs} availableModes={AVAILABLE_MODES} />
          <FineTune prefs={prefs} onChange={setPrefs} />
        </>
      )}
      <ResultsPanel
        dataset={dataset}
        onRetry={retry}
        hasEndpoints={Boolean(origin && destination)}
        outcome={outcome}
        selectedId={selected?.id ?? null}
        onSelect={selectRoute}
        onTryDemo={landmarks.some((l) => l.id === 'ucc-quad') ? tryDemo : undefined}
        showEvidenceOnMap={showEvidence}
        onToggleEvidence={setShowEvidence}
      />
    </div>
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
        <EvidenceOverlay route={showEvidence ? selected : null} lampCoords={lampCoords} theme={theme} />
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

            {compactPlanner ? (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                  <span className="sr-only">Route from </span>
                  <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-bg" aria-hidden="true">
                    A
                  </span>
                  <span className="align-middle">{origin?.label}</span>
                  <span className="sr-only"> to </span>
                  <span className="mx-1 text-ink-subtle" aria-hidden="true">
                    →
                  </span>
                  <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-accent-contrast" aria-hidden="true">
                    B
                  </span>
                  <span className="align-middle">{destination?.label}</span>
                </p>
                <IconButton label="Edit start and destination" onClick={() => setEditingEndpoints(true)}>
                  <Pencil className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
            ) : (
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
                <div className="flex items-center justify-end gap-1">
                  {!isDesktop && editingEndpoints && origin && destination && (
                    <button
                      type="button"
                      onClick={() => setEditingEndpoints(false)}
                      className="mr-auto inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold text-accent hover:bg-surface-raised"
                    >
                      Done
                    </button>
                  )}
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
            )}

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
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
          style={{ top: isDesktop ? 20 : panelHeight + 20, marginLeft: isDesktop ? DESKTOP_PANEL_WIDTH / 2 : 0 }}
        >
          <p aria-live="polite" className="rounded-full border border-line bg-surface-glass px-4 py-2 text-sm font-semibold shadow-float backdrop-blur-xl">
            Tap the map to set your {pickTarget === 'origin' ? 'start' : 'destination'}
          </p>
        </div>
      )}

      {!isDesktop && (
        <section aria-label="Routes" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
          <div
            ref={sheetRef}
            className="pointer-events-auto max-h-[52dvh] overflow-y-auto rounded-2xl border border-line bg-surface-glass p-3 shadow-float backdrop-blur-xl"
          >
            {results}
          </div>
        </section>
      )}
    </div>
  );
}
