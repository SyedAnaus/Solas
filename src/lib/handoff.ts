import { cumulativeDistances, pointAlong } from './graph/geo';
import type { LngLat } from './graph/types';

const fmt = ([lon, lat]: LngLat) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

/**
 * An approximate Google Maps walking link for a route. Up to `waypoints` points spaced evenly by
 * distance along Solas's route are passed as waypoints to nudge Google towards the same streets,
 * but Google Maps recalculates the walk itself, so the result can differ. This only builds a URL.
 */
export function googleMapsWalkingUrl(coordinates: LngLat[], waypoints = 3): string {
  const origin = coordinates[0]!;
  const destination = coordinates[coordinates.length - 1]!;
  const params = new URLSearchParams({ api: '1', origin: fmt(origin), destination: fmt(destination), travelmode: 'walking' });
  if (coordinates.length > 2 && waypoints > 0) {
    const cumulative = cumulativeDistances(coordinates, 0);
    const total = cumulative[cumulative.length - 1] ?? 0;
    if (total > 0) {
      const picks: string[] = [];
      for (let i = 1; i <= waypoints; i++) picks.push(fmt(pointAlong(coordinates, cumulative, (i * total) / (waypoints + 1))));
      params.set('waypoints', [...new Set(picks)].join('|'));
    }
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
