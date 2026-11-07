import type { TrackKind } from '../../config/theme';
import type { RouteCandidate } from '../../lib/routing/engine';

/** The fastest route is always the slate track; any preferred alternative is orange. */
export function trackOf(route: RouteCandidate): TrackKind {
  return route.roles.includes('fastest') ? 'fastest' : 'alternative';
}
