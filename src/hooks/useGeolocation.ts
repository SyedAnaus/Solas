import { useCallback, useState } from 'react';
import type { LngLat } from '../lib/graph/types';

export type GeolocationResult = { ok: true; point: LngLat; accuracyM: number } | { ok: false; message: string };

/** One-shot location request, only ever triggered by an explicit user action. */
export function useGeolocation(): { locating: boolean; locate: () => Promise<GeolocationResult> } {
  const [locating, setLocating] = useState(false);

  const locate = useCallback(async (): Promise<GeolocationResult> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return { ok: false, message: 'This browser cannot share your location. Choose a place or tap the map instead.' };
    }
    setLocating(true);
    try {
      return await new Promise<GeolocationResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ ok: true, point: [pos.coords.longitude, pos.coords.latitude], accuracyM: pos.coords.accuracy }),
          (err) => {
            const message =
              err.code === err.PERMISSION_DENIED
                ? 'Location permission was declined. Choose a place or tap the map instead.'
                : err.code === err.TIMEOUT
                  ? 'Finding your location took too long. Try again or tap the map.'
                  : 'Your location is unavailable right now. Choose a place or tap the map.';
            resolve({ ok: false, message });
          },
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
        );
      });
    } finally {
      setLocating(false);
    }
  }, []);

  return { locating, locate };
}
