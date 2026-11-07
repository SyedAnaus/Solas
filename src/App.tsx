import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Info, Loader2, X } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { IconButton } from './components/IconButton';
import { Notice } from './components/Notice';
import { MapView, type MapHit, type MapStatus } from './features/map/MapView';
import { CoverageOverlay } from './features/map/overlays/CoverageOverlay';
import { LandmarkOverlay } from './features/map/overlays/LandmarkOverlay';
import { RouteOverlay } from './features/map/overlays/RouteOverlay';
import { RouteCallouts } from './features/map/overlays/RouteCallouts';
import { EvidenceOverlay } from './features/map/overlays/EvidenceOverlay';
import { EndpointMarker } from './features/map/overlays/EndpointMarkers';
import { FitToBounds, FitToRoute } from './features/map/overlays/CameraEffects';
import { clampPadding, type Padding } from './features/map/camera';
import { AboutDialog } from './features/layout/AboutDialog';
import { BottomSheet, type Detent } from './features/layout/BottomSheet';
import { EvidenceLegend } from './features/layout/EvidenceLegend';
import { MapControls } from './features/layout/MapControls';
import { EndpointsCard } from './features/planner/EndpointsCard';
import { endpointsFromHash, endpointsToHash, landmarkEndpoint, mapEndpoint, type Endpoint, type EndpointRole } from './features/planner/endpoints';
import { ModeSelector } from './features/preferences/PreferencePanel';
import { announcePlan } from './features/routes/announce';
import { ResultsPanel } from './features/routes/ResultsPanel';
import { RouteDetailsView } from './features/routes/RouteDetailsView';
import { routeTitle } from './features/routes/routeText';
import { useDataset } from './hooks/useDataset';
import { useGeolocation } from './hooks/useGeolocation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useMotionPreference } from './hooks/useMotionPreference';
import { formatDistance, formatDuration } from './lib/format';
import type { LngLat } from './lib/graph/types';
import { extraTimeText } from './lib/routing/explain';
import { planRoutes, type PlanResult } from './lib/routing/planner';
import { DEFAULT_PREFERENCES, type RoutePreferences } from './lib/routing/preferences';

type View = 'plan' | 'details';

/** The legend is drawn whenever lighting evidence is on, so the camera leaves room for it. */
const showLegendFor = (evidenceOn: boolean) => evidenceOn;

export default function App() {
  const isPanel = useMediaQuery('(min-width: 768px)');
  const isWide = useMediaQuery('(min-width: 1024px)');
  const panelW = isWide ? 400 : 360;
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const restoreDetailsFocus = useRef(false);
  const { reduceMotion, systemReduce, setUserReduce } = useMotionPreference();
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
  const [evidenceOn, setEvidenceOn] = useState(DEFAULT_PREFERENCES.mode === 'better_lit');
  const [detent, setDetent] = useState<Detent>('medium');
  const [sheetPx, setSheetPx] = useState(0);
  const [legendPx, setLegendPx] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const { locating, locate } = useGeolocation();

  // Restore endpoints from a shared link once landmarks are known; mirror changes to the hash.
  const [hydrated, setHydrated] = useState(false);
  if (manifest && !hydrated) {
    setHydrated(true);
    const fromHash = endpointsFromHash(window.location.hash, manifest.landmarks);
    if (fromHash.origin) setOrigin(fromHash.origin);
    if (fromHash.destination) setDestination(fromHash.destination);
  }
  useEffect(() => {
    if (!hydrated) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${endpointsToHash(origin, destination)}`);
  }, [hydrated, origin, destination]);
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

  // Escape cancels an explicit "choose on map".
  useEffect(() => {
    if (!explicitPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setExplicitPick(null);
      if (!isPanel) setDetent('medium');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [explicitPick, isPanel]);

  const setEndpoint = useCallback((role: EndpointRole, endpoint: Endpoint | null) => {
    if (role === 'origin') setOrigin(endpoint);
    else setDestination(endpoint);
    setInputNotice(null);
  }, []);

  const afterPick = useCallback(() => {
    setExplicitPick(null);
    if (!isPanel) setDetent('medium');
  }, [isPanel]);

  const trySetPoint = useCallback(
    (role: EndpointRole, point: LngLat, make: () => Endpoint) => {
      if (!engine) return;
      const snap = engine.snap(point);
      if (!snap.ok) {
        setInputNotice({ role, message: snap.error.message });
        return;
      }
      setEndpoint(role, make());
      afterPick();
    },
    [engine, setEndpoint, afterPick],
  );

  const outcome: PlanResult | null = useMemo(
    () => (engine && origin && destination ? planRoutes(engine, origin.point, destination.point, prefs) : null),
    [engine, origin, destination, prefs],
  );
  const routes = useMemo(() => (outcome?.ok ? outcome.routes : []), [outcome]);

  // Selection and view follow each new plan; the user's explicit choice holds until the plan changes.
  const [choice, setChoice] = useState<{ plan: PlanResult | null; id: string | null; view: View }>({ plan: null, id: null, view: 'plan' });
  if (choice.plan !== outcome) setChoice({ plan: outcome, id: null, view: 'plan' });
  const recommendedId = outcome?.ok ? outcome.recommendedId : null;
  const selected = routes.find((r) => r.id === choice.id) ?? routes.find((r) => r.id === recommendedId) ?? routes[0] ?? null;
  const view: View = selected ? choice.view : 'plan';
  const selectRoute = useCallback((id: string) => setChoice((c) => ({ ...c, id })), []);
  const openDetails = () => {
    setChoice((c) => ({ ...c, view: 'details' }));
    if (!isPanel) setDetent('large');
  };
  const closeDetails = () => {
    restoreDetailsFocus.current = true;
    setChoice((c) => ({ ...c, view: 'plan' }));
    if (!isPanel) setDetent('medium');
  };
  useEffect(() => {
    if (view === 'plan' && restoreDetailsFocus.current) {
      restoreDetailsFocus.current = false;
      document.getElementById('route-details-button')?.focus();
    }
  }, [view]);

  const onMapClick = useCallback(
    (lngLat: [number, number], hit: MapHit) => {
      if (pickTarget) {
        const lm = hit.landmarkId ? landmarks.find((l) => l.id === hit.landmarkId) : undefined;
        if (lm) {
          setEndpoint(pickTarget, landmarkEndpoint(lm));
          afterPick();
          return;
        }
        trySetPoint(pickTarget, lngLat, () => mapEndpoint(lngLat));
        return;
      }
      if (hit.routeId) selectRoute(hit.routeId);
    },
    [pickTarget, landmarks, setEndpoint, afterPick, trySetPoint, selectRoute],
  );

  const onLocate = useCallback(async () => {
    const result = await locate();
    if (!result.ok) {
      setInputNotice({ role: 'origin', message: result.message });
      return;
    }
    trySetPoint('origin', result.point, () => ({ kind: 'location', point: result.point, label: 'My location', accuracyM: result.accuracyM }));
  }, [locate, trySetPoint]);

  const onPick = (role: EndpointRole) => {
    setExplicitPick(role);
    if (!isPanel) setDetent('peek');
  };

  const onPrefs = (next: RoutePreferences) => {
    if (next.mode !== prefs.mode) setEvidenceOn(next.mode === 'better_lit');
    setPrefs(next);
  };

  const tryDemo = () => {
    const a = landmarks.find((l) => l.id === 'ucc-quad');
    const b = landmarks.find((l) => l.id === 'parnell-place');
    if (!a || !b) return;
    setOrigin(landmarkEndpoint(a));
    setDestination(landmarkEndpoint(b));
    setExplicitPick(null);
    setInputNotice(null);
  };

  const errors = {
    origin: inputNotice?.role === 'origin' ? inputNotice.message : outcome && !outcome.ok && outcome.error.kind === 'snap' && outcome.error.which === 'origin' ? outcome.error.failure.message : null,
    destination:
      inputNotice?.role === 'destination' ? inputNotice.message : outcome && !outcome.ok && outcome.error.kind === 'snap' && outcome.error.which === 'destination' ? outcome.error.failure.message : null,
  };

  // Map insets keep routes clear of the panel, the sheet, the brand pill and the controls.
  useEffect(() => {
    document.documentElement.style.setProperty('--map-bottom-inset', isPanel ? '0px' : `${Math.round(sheetPx)}px`);
  }, [isPanel, sheetPx]);
  const { width: vw, height: vh } = viewport;
  const padding: Padding = clampPadding(
    isPanel
      ? { top: 40, bottom: showLegendFor(evidenceOn) ? Math.max(120, legendPx + 56) : 40, left: panelW + 40, right: 76 }
      : { top: showLegendFor(evidenceOn) ? Math.max(128, legendPx + 88) : 84, bottom: sheetPx + 48, left: 24, right: 64 },
    vw,
    vh,
  );

  const announcement = announcePlan(outcome, selected?.id ?? null);
  const showLegend = evidenceOn && Boolean(selected) && (isPanel || detent !== 'large');

  const planContent = (
    <div className="space-y-4">
      <EndpointsCard
        origin={origin}
        destination={destination}
        landmarks={landmarks}
        disabled={!engine}
        pickTarget={pickTarget}
        locating={locating}
        errors={errors}
        onChange={setEndpoint}
        onPick={onPick}
        onLocate={onLocate}
        onSwap={() => {
          setOrigin(destination);
          setDestination(origin);
          setInputNotice(null);
        }}
      />
      {engine && origin && destination && <ModeSelector prefs={prefs} onChange={onPrefs} />}
      {mapStatus.kind === 'unsupported' && <Notice tone="error">{mapStatus.message}</Notice>}
      {mapStatus.kind === 'ready' && mapStatus.basemap.kind === 'offline' && (
        <Notice tone="warning" title="Basemap unavailable">
          Map tiles could not be loaded, so only Solas&apos;s own data is shown. Routes still work.
        </Notice>
      )}
      {mapStatus.kind === 'ready' && mapStatus.tilesDegraded && mapStatus.basemap.kind === 'remote' && (
        <Notice tone="warning">Some map tiles failed to load. Routes are unaffected.</Notice>
      )}
      <ResultsPanel
        dataset={dataset}
        onRetry={retry}
        hasEndpoints={Boolean(origin && destination)}
        outcome={outcome}
        selectedId={selected?.id ?? null}
        mode={prefs.mode}
        onSelect={selectRoute}
        onOpenDetails={openDetails}
        onTryDemo={landmarks.some((l) => l.id === 'ucc-quad') ? tryDemo : undefined}
      />
    </div>
  );

  const content =
    view === 'details' && selected && manifest && outcome?.ok ? (
      <RouteDetailsView route={selected} manifest={manifest} mode={prefs.mode} onBack={closeDetails} />
    ) : (
      planContent
    );

  const sheetHeader = explicitPick ? (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold text-ink">Tap the map to set your {explicitPick === 'origin' ? 'start' : 'destination'}</p>
        <p className="text-[13px] text-ink-2">Anywhere inside the dashed area.</p>
      </div>
      <button type="button" onClick={() => { setExplicitPick(null); setDetent('medium'); }} className="pressable min-h-11 rounded-full bg-fill px-4 text-[14px] font-semibold text-ink">
        Cancel
      </button>
    </div>
  ) : dataset.status === 'loading-manifest' || dataset.status === 'loading-graph' ? (
    <p className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink">
      <Loader2 className="size-4 animate-spin text-slate" aria-hidden="true" /> Loading Cork walking data…
    </p>
  ) : selected ? (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="tnum truncate text-[17px] font-semibold text-ink">
          {formatDuration(selected.metrics.durationS)} · {routeTitle(selected)}
        </p>
        <p className="tnum truncate text-[13px] text-ink-2">
          {selected.roles.includes('fastest') ? 'Fastest' : extraTimeText(selected.extraS)} · {formatDistance(selected.metrics.distanceM)}
        </p>
      </div>
      {view === 'plan' && (
        <button type="button" onClick={openDetails} className="pressable inline-flex min-h-11 items-center gap-0.5 rounded-full bg-fill pl-3.5 pr-2 text-[14px] font-semibold text-ink">
          Details <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  ) : (
    <div>
      <p className="text-[17px] font-semibold text-ink">Plan a walk</p>
      <p className="text-[13px] text-ink-2">Choose two places, or tap the map.</p>
    </div>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-canvas text-ink">
      <a href="#planner" onClick={(event) => {
        event.preventDefault(); // The URL hash stores the trip, not in-page navigation.
        if (!isPanel) setDetent('large');
        document.getElementById('planner')?.focus({ preventScroll: true });
      }} className="sr-only-focusable absolute left-3 top-3 z-50 rounded-full bg-ink px-4 py-2.5 font-semibold text-white">
        Skip to route planner
      </a>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <MapView
        onStatusChange={setMapStatus}
        onMapClick={onMapClick}
        ariaLabel={`Map of the supported Cork walking area.${pickTarget ? ` Tap to set the ${pickTarget === 'origin' ? 'start' : 'destination'}.` : ''}${selected ? ` Showing ${routeTitle(selected)} route.` : ''}`}
      >
        {manifest && <CoverageOverlay coverage={manifest.coverage} />}
        {manifest && <LandmarkOverlay landmarks={landmarks} hasGlyphs={mapStatus.kind === 'ready' && mapStatus.basemap.kind === 'remote'} />}
        <RouteOverlay routes={routes} selectedId={selected?.id ?? null} evidenceOn={evidenceOn} />
        <EvidenceOverlay route={evidenceOn ? selected : null} lampCoords={lampCoords} />
        <RouteCallouts graph={engine?.graph ?? null} routes={routes} selectedId={selected?.id ?? null} onSelect={selectRoute} />
        <EndpointMarker point={origin?.point ?? null} role="origin" label={origin?.label ?? ''} />
        <EndpointMarker point={destination?.point ?? null} role="destination" label={destination?.label ?? ''} />
        <FitToRoute route={selected} padding={padding} reduceMotion={reduceMotion} nonce={fitNonce} />
        {manifest && !selected && <FitToBounds bbox={manifest.coverage.bbox} padding={padding} />}
      </MapView>

      {!isPanel && (
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          aria-label="About Solas, data and settings"
          className="glass pressable absolute left-3 z-10 inline-flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4"
          style={{ top: 'calc(var(--safe-top) + 12px)' }}
        >
          <BrandMark size={32} />
          <span className="text-[16px] font-bold tracking-[-0.01em] text-ink">Solas</span>
        </button>
      )}

      <MapControls
        evidenceOn={evidenceOn}
        onToggleEvidence={() => setEvidenceOn((v) => !v)}
        canFit={Boolean(selected)}
        onFit={() => {
          if (!isPanel) setDetent('peek');
          setFitNonce((n) => n + 1);
        }}
        top={isPanel ? '120px' : 'calc(var(--safe-top) + 12px)'}
      />

      {showLegend && (
        <EvidenceLegend
          key={isPanel ? 'panel' : 'sheet'}
          collapsible={!isPanel}
          onHeightChange={setLegendPx}
          style={isPanel ? { left: panelW + 28, bottom: 32 } : { left: 12, top: 'calc(var(--safe-top) + 64px)' }}
        />
      )}

      {explicitPick && isPanel && (
        <div className="pointer-events-none absolute top-5 z-20 -translate-x-1/2" style={{ left: panelW + (vw - panelW) / 2 }}>
          <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-4 pr-1">
            <span className="text-[14px] font-semibold text-ink">Tap the map to set your {explicitPick === 'origin' ? 'start' : 'destination'}</span>
            <IconButton label="Cancel choosing on the map" onClick={() => setExplicitPick(null)}>
              <X className="size-4" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      )}

      {isPanel ? (
        <aside
          id="planner"
          tabIndex={-1}
          aria-label="Route planner"
          className="glass-strong absolute bottom-3 left-3 top-3 z-20 flex flex-col overflow-hidden rounded-[28px]"
          style={{ width: panelW }}
        >
          <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
            <BrandMark size={36} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink">Solas</h1>
              <p className="truncate text-[13px] text-ink-2">The better walk is worth seeing.</p>
            </div>
            <IconButton label="About Solas, data and settings" variant="filled" onClick={() => setAboutOpen(true)} tooltipSide="left">
              <Info className="size-5" aria-hidden="true" />
            </IconButton>
          </header>
          <div className="scroll-y min-h-0 flex-1 px-5 pb-6 pt-1">{content}</div>
        </aside>
      ) : (
        <div id="planner" tabIndex={-1}>
          <h1 className="sr-only">Solas — the better walk is worth seeing</h1>
          <BottomSheet label="Route planner" detent={detent} onDetentChange={setDetent} onHeightChange={setSheetPx} header={sheetHeader}>
            {content}
          </BottomSheet>
        </div>
      )}

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        manifest={manifest}
        reduceMotion={reduceMotion}
        systemReduce={systemReduce}
        onReduceMotion={setUserReduce}
      />
    </div>
  );
}
