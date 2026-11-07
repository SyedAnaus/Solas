import { useEffect } from 'react';
import type { RouteCandidate } from '../../lib/routing/engine';
import { useMapContext } from './MapContext';

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Keep padding inside the visible map so MapLibre never receives impossible insets. */
export function clampPadding(p: Padding, width: number, height: number): Padding {
  const maxV = Math.max(0, height - 80);
  const maxH = Math.max(0, width - 80);
  const v = p.top + p.bottom;
  const h = p.left + p.right;
  const kv = v > maxV && v > 0 ? maxV / v : 1;
  const kh = h > maxH && h > 0 ? maxH / h : 1;
  return { top: p.top * kv, bottom: p.bottom * kv, left: p.left * kh, right: p.right * kh };
}

/**
 * Fit the camera to a route when it changes, when panels resize enough to hide part of it, or
 * when `nonce` changes (the "show whole route" button). Reduced motion jumps instead of flying.
 */
export function useFitToRoute(route: RouteCandidate | null, padding: Padding, reduceMotion: boolean, nonce = 0): void {
  const { map } = useMapContext();
  const pad = `${Math.round(padding.top / 24)}:${Math.round(padding.bottom / 24)}:${Math.round(padding.left / 24)}:${Math.round(padding.right / 24)}`;
  const coords = route?.geometry.coordinates;
  const key = route && coords ? `${route.id}:${coords[0]}:${coords[coords.length - 1]}:${coords.length}:${route.metrics.distanceM.toFixed(1)}:${pad}:${nonce}` : null;
  useEffect(() => {
    if (!map || !route || route.geometry.coordinates.length < 2) return;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const [lon, lat] of route.geometry.coordinates) {
      w = Math.min(w, lon);
      s = Math.min(s, lat);
      e = Math.max(e, lon);
      n = Math.max(n, lat);
    }
    const fit = () => map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding, duration: reduceMotion ? 0 : 650, maxZoom: 17 },
    );
    fit();
    map.on('resize', fit);
    return () => { map.off('resize', fit); };
    // Callers recreate `padding` and `route` objects; `key` captures the meaningful change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, reduceMotion]);
}
