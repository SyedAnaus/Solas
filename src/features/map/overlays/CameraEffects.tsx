import { useEffect, useRef } from 'react';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { useFitToRoute, type Padding } from '../camera';
import { useMapContext } from '../MapContext';

export function FitToRoute({ route, padding, reduceMotion, nonce }: { route: RouteCandidate | null; padding: Padding; reduceMotion: boolean; nonce: number }) {
  useFitToRoute(route, padding, reduceMotion, nonce);
  return null;
}

/** Fit the dataset's coverage once, when it first becomes known. */
export function FitToBounds({ bbox, padding }: { bbox: [number, number, number, number]; padding: Padding }) {
  const { map } = useMapContext();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current) return;
    done.current = true;
    const [w, s, e, n] = bbox;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding, duration: 0 },
    );
  }, [map, bbox, padding]);
  return null;
}
