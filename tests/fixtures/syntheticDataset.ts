/** SYNTHETIC manifest + graph pair for component tests (served through a mocked fetch). */
import type { DatasetManifest } from '../../src/lib/graph/types';
import { buildSyntheticGraphFile, NODES, P } from './syntheticGraph';

export function buildSyntheticDataset() {
  const graph = buildSyntheticGraphFile();
  const manifest: DatasetManifest = {
    schema: 'solas-manifest',
    schemaVersion: 1,
    synthetic: true,
    areaId: graph.meta.areaId,
    areaName: graph.meta.areaName,
    generatedAt: graph.meta.generatedAt,
    osmDataTimestamps: [],
    coverage: graph.meta.coverage,
    counts: graph.meta.counts,
    lightingMetres: graph.meta.lightingMetres,
    licence: graph.meta.licence,
    graph: { path: 'data/cork/graph.json', bytes: 0, sha256: 'synthetic' },
    landmarks: [
      { id: 'syn-a', label: 'Synthetic Point A', category: 'test', osm: 'node/1', labelPoint: NODES.A, routingPoint: NODES.A, routingPointDistanceM: 0 },
      { id: 'syn-c', label: 'Synthetic Point C', category: 'test', osm: 'node/3', labelPoint: NODES.C, routingPoint: NODES.C, routingPointDistanceM: 0 },
      { id: 'syn-island', label: 'Synthetic Island', category: 'test', osm: 'node/7', labelPoint: P(350, 300), routingPoint: P(350, 300), routingPointDistanceM: 0 },
    ],
  };
  return { manifest, graph };
}

/** A fetch stand-in that serves the synthetic dataset and fails everything else. */
export function syntheticFetch() {
  const { manifest, graph } = buildSyntheticDataset();
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('data/cork/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
    if (url.endsWith('data/cork/graph.json')) return new Response(JSON.stringify(graph), { status: 200 });
    return new Response('not found', { status: 404 });
  };
}
