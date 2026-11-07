/**
 * Minimal stand-in for maplibre-gl in jsdom (which has no WebGL).
 * Usage: vi.mock('maplibre-gl', () => import('../mocks/maplibre'));
 */
type Handler = (...args: unknown[]) => void;

export class Map {
  static instances: Map[] = [];
  handlers: Record<string, Handler[]> = {};
  touchZoomRotate = { disableRotation: () => {} };
  options: unknown;
  constructor(options: unknown) {
    this.options = options;
    Map.instances.push(this);
  }
  on(type: string, handler: Handler) {
    (this.handlers[type] ??= []).push(handler);
    return this;
  }
  once(type: string, handler: Handler) {
    return this.on(type, handler);
  }
  off() {
    return this;
  }
  emit(type: string, ...args: unknown[]) {
    for (const h of this.handlers[type] ?? []) h(...args);
  }
  addControl() {
    return this;
  }
  fitBounds(bounds: unknown) {
    this.lastFit = bounds;
    return this;
  }
  lastFit: unknown = null;
  getStyle() {
    return { layers: [] };
  }
  getLayer() {
    return undefined;
  }
  getSource() {
    return undefined;
  }
  addSource() {}
  addLayer() {}
  removeLayer() {}
  removeSource() {}
  queryRenderedFeatures() {
    return [];
  }
  setStyle() {}
  remove() {}
}

export class AttributionControl {}
export class NavigationControl {}
export function setWorkerUrl(_url: string) {}

export class Marker {
  static live = 0;
  setLngLat() {
    return this;
  }
  addTo() {
    Marker.live += 1;
    return this;
  }
  remove() {
    Marker.live -= 1;
    return this;
  }
}
