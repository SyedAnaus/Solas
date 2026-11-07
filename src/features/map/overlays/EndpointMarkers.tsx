import { useEffect } from 'react';
import { Marker } from 'maplibre-gl';
import type { LngLat } from '../../../lib/graph/types';
import { useMapContext } from '../MapContext';

function makeMarkerElement(letter: string, label: string, variant: 'origin' | 'destination'): HTMLElement {
  // MapLibre owns the outer element's transform, so the pin shape lives on inner elements.
  const el = document.createElement('div');
  el.className = 'solas-endpoint-marker';
  el.dataset.variant = variant;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  const pin = document.createElement('div');
  pin.className = 'solas-endpoint-pin';
  const text = document.createElement('span');
  text.textContent = letter;
  pin.appendChild(text);
  el.appendChild(pin);
  return el;
}

/** "A"/"B" markers: letters, not just colours, distinguish start and destination. */
export function EndpointMarker({ point, role, label }: { point: LngLat | null; role: 'origin' | 'destination'; label: string }) {
  const { map } = useMapContext();
  const lon = point?.[0];
  const lat = point?.[1];
  useEffect(() => {
    if (!map || lon === undefined || lat === undefined) return;
    const element = makeMarkerElement(role === 'origin' ? 'A' : 'B', `${role === 'origin' ? 'Start' : 'Destination'}: ${label}`, role);
    const marker = new Marker({ element, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, lon, lat, role, label]);
  return null;
}
