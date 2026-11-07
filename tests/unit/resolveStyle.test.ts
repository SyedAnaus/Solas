import { describe, expect, it, vi } from 'vitest';
import { buildOfflineStyle, resolveBasemapStyle, tintStyle } from '../../src/features/map/resolveStyle';
import { BASEMAP_CANDIDATES } from '../../src/config/map';

const validStyle = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://example.invalid/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#111' } },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('resolveBasemapStyle', () => {
  it('uses the first candidate when it loads', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(validStyle));
    const result = await resolveBasemapStyle('light', fetchImpl);
    expect(result.source).toEqual({ kind: 'remote', id: 'openfreemap-positron', label: 'OpenFreeMap Positron' });
    expect(result.warnings).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(BASEMAP_CANDIDATES.light[0]!.url, expect.anything());
  });

  it('falls back to the next candidate when the first fails', async () => {
    const fetchImpl = vi
      .fn<(input: string) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 503))
      .mockResolvedValueOnce(jsonResponse(validStyle));
    const result = await resolveBasemapStyle('dark', fetchImpl);
    expect(result.source.kind).toBe('remote');
    expect(result.source).toMatchObject({ id: 'openfreemap-fiord' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/HTTP 503/);
  });

  it('rejects documents that are not MapLibre v8 styles', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: 7, layers: [] }));
    const result = await resolveBasemapStyle('light', fetchImpl);
    expect(result.source).toEqual({ kind: 'offline' });
    expect(result.warnings).toHaveLength(BASEMAP_CANDIDATES.light.length);
  });

  it('returns the offline style when the network is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await resolveBasemapStyle('dark', fetchImpl);
    expect(result.source).toEqual({ kind: 'offline' });
    expect(result.style.sources).toEqual({});
    expect(result.style.layers[0]).toMatchObject({ id: 'background', type: 'background' });
  });

  it('times out slow style servers', async () => {
    const fetchImpl = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const result = await resolveBasemapStyle('light', fetchImpl, 10);
    expect(result.source).toEqual({ kind: 'offline' });
    expect(result.warnings[0]).toMatch(/timed out/);
  });
});

describe('style helpers', () => {
  it('offline style makes no third-party requests', () => {
    const style = buildOfflineStyle('light');
    expect(style.sources).toEqual({});
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
  });

  it('tints only the dark theme background and water layers', () => {
    const style = validStyle as unknown as Parameters<typeof tintStyle>[0];
    const dark = tintStyle(style, 'dark');
    expect(dark.layers[0]).toMatchObject({ paint: { 'background-color': '#0b1029' } });
    expect(dark.layers[1]).toMatchObject({ paint: { 'fill-color': '#121a3d' } });
    expect(tintStyle(style, 'light')).toBe(style);
  });
});
