import { useCallback, useEffect, useState } from 'react';
import { loadGraph, loadManifest } from '../data/loadDataset';
import type { DatasetManifest } from '../lib/graph/types';
import { RoutingEngine } from '../lib/routing/engine';

export type DatasetState =
  | { status: 'loading-manifest' }
  | { status: 'loading-graph'; manifest: DatasetManifest }
  | { status: 'ready'; manifest: DatasetManifest; engine: RoutingEngine; loadMs: number }
  | { status: 'error'; message: string; manifest?: DatasetManifest };

/** Load the manifest (small) first so coverage and landmarks appear quickly, then the graph. */
export function useDataset(): { state: DatasetState; retry: () => void } {
  const [state, setState] = useState<DatasetState>({ status: 'loading-manifest' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    (async () => {
      let manifest: DatasetManifest | undefined;
      try {
        manifest = await loadManifest();
        if (cancelled) return;
        setState({ status: 'loading-graph', manifest });
        const graph = await loadGraph(manifest);
        const engine = new RoutingEngine(graph);
        if (cancelled) return;
        setState({ status: 'ready', manifest, engine, loadMs: performance.now() - t0 });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'The walking data could not be loaded.';
        setState({ status: 'error', message, ...(manifest ? { manifest } : {}) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading-manifest' });
    setAttempt((a) => a + 1);
  }, []);

  return { state, retry };
}
