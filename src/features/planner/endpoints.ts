import type { Landmark, LngLat } from '../../lib/graph/types';

export type EndpointRole = 'origin' | 'destination';

export type Endpoint =
  | { kind: 'landmark'; landmarkId: string; point: LngLat; label: string }
  | { kind: 'map'; point: LngLat; label: string }
  | { kind: 'location'; point: LngLat; label: string; accuracyM: number };

export function landmarkEndpoint(l: Landmark): Endpoint {
  return { kind: 'landmark', landmarkId: l.id, point: l.routingPoint, label: l.label };
}

export function mapEndpoint(point: LngLat): Endpoint {
  return { kind: 'map', point, label: `Map point ${point[1].toFixed(5)}, ${point[0].toFixed(5)}` };
}

/* --------------------------------------------------------------- URL hash (shareable demo links) */

function encodeEndpoint(e: Endpoint | null): string | null {
  if (!e) return null;
  if (e.kind === 'landmark') return e.landmarkId;
  // Device locations are never written to the URL.
  if (e.kind === 'location') return null;
  return `@${e.point[1].toFixed(6)},${e.point[0].toFixed(6)}`;
}

export function endpointsToHash(origin: Endpoint | null, destination: Endpoint | null): string {
  const params = new URLSearchParams();
  const from = encodeEndpoint(origin);
  const to = encodeEndpoint(destination);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const s = params.toString();
  return s ? `#${s}` : '';
}

function decodeEndpoint(value: string | null, landmarks: Landmark[]): Endpoint | null {
  if (!value) return null;
  if (value.startsWith('@')) {
    const [lat, lon] = value.slice(1).split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180) {
      return mapEndpoint([lon!, lat!]);
    }
    return null;
  }
  const lm = landmarks.find((l) => l.id === value);
  return lm ? landmarkEndpoint(lm) : null;
}

export function endpointsFromHash(hash: string, landmarks: Landmark[]): { origin: Endpoint | null; destination: Endpoint | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return { origin: decodeEndpoint(params.get('from'), landmarks), destination: decodeEndpoint(params.get('to'), landmarks) };
}
