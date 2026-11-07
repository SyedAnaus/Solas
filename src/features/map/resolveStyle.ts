import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAP_CANDIDATES, MAP_BACKGROUND, STYLE_FETCH_TIMEOUT_MS } from '../../config/map';
import { BASEMAP_TINT } from '../../config/theme';

export type BasemapSource = { kind: 'remote'; id: string; label: string } | { kind: 'offline' };

export interface ResolvedStyle {
  style: StyleSpecification;
  source: BasemapSource;
  /** Human-readable notes about candidates that failed, for the UI to show. */
  warnings: string[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isStyleSpecification(value: unknown): value is StyleSpecification {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.version === 8 && Array.isArray(v.layers) && typeof v.sources === 'object' && v.sources !== null;
}

/** Aborts surface as DOMException, which is not an Error subclass in every runtime. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return 'timed out';
  if (error instanceof Error) return error.message;
  return 'failed';
}

async function fetchStyle(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<StyleSpecification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: unknown = await response.json();
    if (!isStyleSpecification(json)) throw new Error('not a MapLibre v8 style');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A minimal style with no third-party requests. Solas draws its own walking network on top, so
 * routes stay usable even when basemap tiles are unreachable.
 */
export function buildOfflineStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Solas offline',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': MAP_BACKGROUND } }],
  };
}

/** Recolour known basemap layers into the Solas palette (cream land, link-water water). */
export function tintStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    const tint = BASEMAP_TINT[layer.id];
    if (!tint || !('paint' in layer)) return layer;
    if (!tint.prop.startsWith(`${layer.type === 'background' ? 'background' : layer.type}-`)) return layer;
    return { ...layer, paint: { ...(layer.paint ?? {}), [tint.prop]: tint.value } } as typeof layer;
  });
  return { ...style, layers };
}

/**
 * Try each OpenFreeMap style in order; fall back to the offline style.
 * Never throws: the map should always be able to start.
 */
export async function resolveBasemapStyle(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = STYLE_FETCH_TIMEOUT_MS,
): Promise<ResolvedStyle> {
  const warnings: string[] = [];
  for (const candidate of BASEMAP_CANDIDATES) {
    try {
      const style = await fetchStyle(candidate.url, fetchImpl, timeoutMs);
      return { style: tintStyle(style), source: { kind: 'remote', id: candidate.id, label: candidate.label }, warnings };
    } catch (error) {
      warnings.push(`${candidate.label} unavailable (${describeError(error)}).`);
    }
  }
  return { style: buildOfflineStyle(), source: { kind: 'offline' }, warnings };
}
