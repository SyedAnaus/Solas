import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAP_CANDIDATES, MAP_BACKGROUND, STYLE_FETCH_TIMEOUT_MS, type ThemeName } from '../../config/map';

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
export function buildOfflineStyle(theme: ThemeName): StyleSpecification {
  return {
    version: 8,
    name: 'Solas offline',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': MAP_BACKGROUND[theme] } }],
  };
}

/** Light-touch recolouring so the dark basemap sits in the Solas midnight palette. */
export function tintStyle(style: StyleSpecification, theme: ThemeName): StyleSpecification {
  if (theme !== 'dark') return style;
  const layers = style.layers.map((layer) => {
    if (layer.id === 'background' && layer.type === 'background') {
      return { ...layer, paint: { ...layer.paint, 'background-color': '#0b1029' } };
    }
    if (layer.id === 'water' && layer.type === 'fill') {
      return { ...layer, paint: { ...layer.paint, 'fill-color': '#121a3d' } };
    }
    return layer;
  });
  return { ...style, layers };
}

/**
 * Try each OpenFreeMap style for the theme in order; fall back to the offline style.
 * Never throws: the map should always be able to start.
 */
export async function resolveBasemapStyle(
  theme: ThemeName,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = STYLE_FETCH_TIMEOUT_MS,
): Promise<ResolvedStyle> {
  const warnings: string[] = [];
  for (const candidate of BASEMAP_CANDIDATES[theme]) {
    try {
      const style = await fetchStyle(candidate.url, fetchImpl, timeoutMs);
      return {
        style: tintStyle(style, theme),
        source: { kind: 'remote', id: candidate.id, label: candidate.label },
        warnings,
      };
    } catch (error) {
      warnings.push(`${candidate.label} unavailable (${describeError(error)}).`);
    }
  }
  return { style: buildOfflineStyle(theme), source: { kind: 'offline' }, warnings };
}
