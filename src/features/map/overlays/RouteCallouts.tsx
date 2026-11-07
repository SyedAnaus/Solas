import { useEffect, useRef } from 'react';
import { Marker } from 'maplibre-gl';
import { TRACK } from '../../../config/theme';
import { formatDuration } from '../../../lib/format';
import type { PedestrianGraph } from '../../../lib/graph/types';
import { calloutPoint } from '../../../lib/routing/callout';
import type { RouteCandidate } from '../../../lib/routing/engine';
import { MODE_LABEL } from '../../../lib/routing/preferences';
import { routeTitle } from '../../routes/routeText';
import { useMapContext } from '../MapContext';
import { trackOf } from '../track';

/**
 * Tappable time labels on each route (Apple Maps style). They name the route in text, so routes are
 * never distinguished by colour alone, and give a large touch target for switching routes.
 */
export function RouteCallouts({
  graph,
  routes,
  selectedId,
  onSelect,
}: {
  graph: PedestrianGraph | null;
  routes: RouteCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { map } = useMapContext();
  const buttons = useRef<{ route: RouteCandidate; element: HTMLButtonElement }[]>([]);
  useEffect(() => {
    if (!map || !graph || routes.length < 2) return;
    const markers = routes.map((route) => {
      const others = routes.filter((r) => r.id !== route.id);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'solas-callout';
      el.dataset.routeId = route.id;
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = TRACK[trackOf(route)].line;
      swatch.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = `${MODE_LABEL[route.roles[route.roles.length - 1]!]} · ${formatDuration(route.metrics.durationS)}`;
      el.append(swatch, text);
      buttons.current.push({ route, element: el });
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(route.id);
      });
      return new Marker({ element: el, anchor: 'bottom', offset: [0, -8] }).setLngLat(calloutPoint(graph, route, others)).addTo(map);
    });
    // Nearby alternatives often share the same streets. Keep their labels independently
    // tappable instead of letting the selected label cover the other route's button.
    const separateLabels = () => {
      const placed: { left: number; right: number; top: number; bottom: number }[] = [];
      const mapWidth = map.getContainer().clientWidth;
      const panel = document.querySelector('aside#planner')?.getBoundingClientRect();
      const leftEdge = panel ? panel.right + 8 : 8;
      for (const marker of markers) {
        const element = marker.getElement();
        const point = map.project(marker.getLngLat());
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const center = Math.max(leftEdge + width / 2, Math.min(point.x, mapWidth - width / 2 - 8));
        let offsetY = -8;
        for (const candidate of [-8, height + 8, -height - 16, 2 * height + 16]) {
          const box = { left: center - width / 2, right: center + width / 2, top: point.y + candidate - height, bottom: point.y + candidate };
          if (placed.every((other) => box.right + 6 <= other.left || box.left >= other.right + 6 || box.bottom + 6 <= other.top || box.top >= other.bottom + 6)) {
            offsetY = candidate;
            break;
          }
        }
        marker.setOffset([center - point.x, offsetY]);
        placed.push({ left: center - width / 2, right: center + width / 2, top: point.y + offsetY - height, bottom: point.y + offsetY });
      }
    };
    separateLabels();
    map.on('move', separateLabels);
    map.on('resize', separateLabels);
    return () => {
      map.off('move', separateLabels);
      map.off('resize', separateLabels);
      for (const m of markers) m.remove();
      buttons.current = [];
    };
  }, [map, graph, routes, onSelect]);
  // Keep marker elements mounted when selecting a route, so focused callouts stay focused.
  useEffect(() => {
    for (const { route, element } of buttons.current) {
      const selected = route.id === selectedId;
      element.setAttribute('aria-pressed', String(selected));
      element.setAttribute('aria-label', `${routeTitle(route)} route on the map, ${formatDuration(route.metrics.durationS)}${selected ? ', selected' : '. Select this route'}`);
    }
  }, [map, graph, routes, selectedId, onSelect]);
  return null;
}
