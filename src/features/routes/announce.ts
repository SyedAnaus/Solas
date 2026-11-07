import { formatDistance, formatDuration } from '../../lib/format';
import type { PlanResult } from '../../lib/routing/planner';
import { extraTimeText, headlineLitPct } from '../../lib/routing/explain';
import { routeTitle } from './routeText';

/** One polite sentence for screen readers whenever the route options change. */
export function announcePlan(outcome: PlanResult | null, selectedId: string | null): string {
  if (!outcome) return '';
  if (!outcome.ok) {
    return outcome.error.kind === 'snap' ? outcome.error.failure.message : outcome.error.message;
  }
  const selected = outcome.routes.find((r) => r.id === selectedId) ?? outcome.routes[0]!;
  const count = outcome.routes.length === 1 ? '1 route' : `${outcome.routes.length} routes`;
  const extra = selected.roles.includes('fastest') ? 'the fastest' : `${extraTimeText(selected.extraS)} compared with the fastest`;
  return `${count} found. Selected: ${routeTitle(selected)}, ${formatDuration(selected.metrics.durationS)}, ${formatDistance(selected.metrics.distanceM)}, ${extra}, ${headlineLitPct(selected.metrics)}% mapped or likely lit.`;
}
