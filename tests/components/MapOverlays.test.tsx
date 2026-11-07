import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapContext } from '../../src/features/map/MapContext';
import { EvidenceOverlay } from '../../src/features/map/overlays/EvidenceOverlay';
import { RouteOverlay } from '../../src/features/map/overlays/RouteOverlay';
import { FitToRoute } from '../../src/features/map/overlays/CameraEffects';
import { parseGraph } from '../../src/lib/graph/parse';
import { RoutingEngine } from '../../src/lib/routing/engine';
import { planRoutes } from '../../src/lib/routing/planner';
import { DEFAULT_PREFERENCES } from '../../src/lib/routing/preferences';
import { buildSyntheticGraphFile, NODES } from '../fixtures/syntheticGraph';

describe('route and evidence layer order', () => {
  it('keeps evidence visible above route tracks after repeated toggles', () => {
    const layers: { id: string; type: string }[] = [{ id: 'street-label', type: 'symbol' }];
    const sources = new Map<string, { setData: () => void }>();
    const map = {
      getStyle: () => ({ layers }),
      getLayer: (id: string) => layers.find((layer) => layer.id === id),
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => sources.set(id, { setData: () => {} }),
      removeSource: (id: string) => sources.delete(id),
      addLayer: (layer: { id: string; type: string }, before?: string) => {
        const at = layers.findIndex((l) => l.id === before);
        layers.splice(at < 0 ? layers.length : at, 0, layer);
      },
      removeLayer: (id: string) => {
        const at = layers.findIndex((l) => l.id === id);
        if (at >= 0) layers.splice(at, 1);
      },
    } as unknown as MapLibreMap;
    const engine = new RoutingEngine(parseGraph(buildSyntheticGraphFile()));
    const plan = planRoutes(engine, NODES.A, NODES.C, DEFAULT_PREFERENCES);
    if (!plan.ok) throw new Error('Synthetic fixture must produce a route');
    const selected = plan.routes[0]!;
    const lampCoords = new Map();
    const tree = (evidenceOn: boolean) => (
      <MapContext.Provider value={{ map, styleVersion: 1 }}>
        <RouteOverlay routes={plan.routes} selectedId={selected.id} evidenceOn={evidenceOn} />
        <EvidenceOverlay route={evidenceOn ? selected : null} lampCoords={lampCoords} />
      </MapContext.Provider>
    );
    const view = render(tree(false));
    for (const enabled of [true, false, true]) {
      view.rerender(tree(enabled));
      const ids = layers.map((l) => l.id);
      expect(ids.indexOf('solas-route-line')).toBeLessThan(ids.indexOf('solas-evidence-tube'));
      expect(ids.indexOf('solas-evidence-tube')).toBeLessThan(ids.indexOf('street-label'));
    }
  });
});

describe('route camera safe areas', () => {
  it('refits on map resize and removes the listener on unmount', () => {
    const resizeHandlers = new Set<() => void>();
    const fitBounds = vi.fn();
    const map = {
      fitBounds,
      on: (event: string, handler: () => void) => { if (event === 'resize') resizeHandlers.add(handler); },
      off: (event: string, handler: () => void) => { if (event === 'resize') resizeHandlers.delete(handler); },
    } as unknown as MapLibreMap;
    const engine = new RoutingEngine(parseGraph(buildSyntheticGraphFile()));
    const plan = planRoutes(engine, NODES.A, NODES.C, DEFAULT_PREFERENCES);
    if (!plan.ok) throw new Error('Synthetic fixture must produce a route');
    const padding = { top: 80, bottom: 340, left: 24, right: 64 };
    const view = render(
      <MapContext.Provider value={{ map, styleVersion: 1 }}>
        <FitToRoute route={plan.routes[0]!} padding={padding} reduceMotion nonce={0} />
      </MapContext.Provider>,
    );
    expect(fitBounds).toHaveBeenCalledTimes(1);
    for (const handler of resizeHandlers) handler();
    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(fitBounds).toHaveBeenLastCalledWith(expect.any(Array), { padding, duration: 0, maxZoom: 17 });
    view.unmount();
    expect(resizeHandlers.size).toBe(0);
  });
});
