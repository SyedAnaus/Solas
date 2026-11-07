import { formatDistance, formatDuration } from '../../lib/format';
import type { RouteCandidate } from '../../lib/routing/engine';
import { extraTimeText } from '../../lib/routing/explain';
import { MODE_LABEL } from '../../lib/routing/preferences';
import { lightingSummaryText } from './lighting';

export function routeTitle(route: RouteCandidate): string {
  if (route.roles.length > 1 && route.roles[0] === 'fastest') {
    const others = route.roles.slice(1).map((r) => MODE_LABEL[r].toLowerCase());
    return `Fastest, also ${others.join(' and ')}`;
  }
  return route.roles.map((r) => MODE_LABEL[r]).join(' · ');
}

/** Full spoken summary for screen readers (cards are buttons with this as their label). */
export function routeAccessibleSummary(route: RouteCandidate): string {
  const m = route.metrics;
  const parts = [
    `${routeTitle(route)} route`,
    `about ${formatDuration(m.durationS)}`,
    formatDistance(m.distanceM),
    route.roles.includes('fastest') ? 'fastest option' : `${extraTimeText(route.extraS)} compared with the fastest`,
    `lighting evidence: ${lightingSummaryText(m.lighting)}`,
  ];
  if (route.overCap) parts.push('longer than your time limit');
  return `${parts.join(', ')}.`;
}
