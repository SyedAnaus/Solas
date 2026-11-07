import { assetUrl } from '../lib/assets';
import { DatasetError, parseGraph } from '../lib/graph/parse';
import type { DatasetManifest, PedestrianGraph } from '../lib/graph/types';

export const MANIFEST_PATH = 'data/cork/manifest.json';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchJson(url: string, fetchImpl: FetchLike, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { credentials: 'omit' });
  } catch {
    throw new DatasetError(`Could not download the ${what}. Check your connection and try again.`);
  }
  if (!response.ok) throw new DatasetError(`The ${what} is unavailable (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new DatasetError(`The ${what} is not valid JSON.`);
  }
}

export function validateManifest(input: unknown): DatasetManifest {
  const m = input as DatasetManifest;
  if (!m || m.schema !== 'solas-manifest') throw new DatasetError('The dataset manifest is not a Solas manifest.');
  if (m.schemaVersion !== 1) throw new DatasetError(`Unsupported dataset version ${String(m.schemaVersion)}.`);
  if (typeof m.synthetic !== 'boolean') throw new DatasetError('The dataset manifest does not say whether it is synthetic.');
  if (!m.graph?.path || !Array.isArray(m.landmarks) || !m.coverage?.bbox) {
    throw new DatasetError('The dataset manifest is incomplete.');
  }
  return m;
}

export async function loadManifest(fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<DatasetManifest> {
  return validateManifest(await fetchJson(assetUrl(MANIFEST_PATH), fetchImpl, 'dataset manifest'));
}

export async function loadGraph(
  manifest: DatasetManifest,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<PedestrianGraph> {
  const raw = await fetchJson(assetUrl(manifest.graph.path), fetchImpl, 'walking network');
  const graph = parseGraph(raw);
  if (graph.meta.areaId !== manifest.areaId || graph.meta.synthetic !== manifest.synthetic) {
    throw new DatasetError('The walking network does not match its manifest. Regenerate the dataset.');
  }
  return graph;
}
