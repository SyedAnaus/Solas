import { Accessibility, AlertTriangle, Check, Footprints, Lightbulb, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDistance, formatDuration } from '../../lib/format';
import type { RouteCandidate } from '../../lib/routing/engine';
import { extraTimeText, headlineLitPct } from '../../lib/routing/explain';
import { MODE_LABEL, type RouteRole } from '../../lib/routing/preferences';
import { LightingBar } from './LightingBar';
import { routeAccessibleSummary } from './routeText';

const ROLE_ICON: Record<RouteRole, ReactNode> = {
  fastest: <Timer className="size-3.5" aria-hidden="true" />,
  better_lit: <Lightbulb className="size-3.5" aria-hidden="true" />,
  easier: <Footprints className="size-3.5" aria-hidden="true" />,
  step_free: <Accessibility className="size-3.5" aria-hidden="true" />,
};

/** Compact card for side-by-side comparison. The whole card is the selection button. */
export function RouteCard({ route, selected, onSelect }: { route: RouteCandidate; selected: boolean; onSelect: () => void }) {
  const m = route.metrics;
  const isFastest = route.roles.includes('fastest');
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={routeAccessibleSummary(route)}
      data-route-id={route.id}
      className={`relative flex h-full w-full flex-col rounded-2xl border-2 p-3 text-left transition-colors ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <span className="flex flex-wrap items-center gap-1 pr-7">
        {route.roles.map((role) => (
          <span
            key={role}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              selected ? 'bg-accent text-accent-contrast' : 'bg-surface-raised text-ink'
            }`}
          >
            {ROLE_ICON[role]}
            {MODE_LABEL[role]}
          </span>
        ))}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-accent text-accent-contrast" aria-hidden="true">
          <Check className="size-4" />
        </span>
      )}
      <span className="mt-2 text-[26px] font-extrabold leading-none tracking-tight">{formatDuration(m.durationS)}</span>
      <span className="mt-1 text-xs font-semibold text-ink-muted">
        {isFastest ? 'Fastest' : extraTimeText(route.extraS)} · {formatDistance(m.distanceM)}
      </span>
      <span className="mt-3 block">
        <LightingBar lighting={m.lighting} compact />
      </span>
      <span className="mt-1.5 text-xs text-ink-muted">
        <strong className="text-sm font-extrabold text-ink">{headlineLitPct(m)}%</strong> mapped or likely lit
      </span>
      {route.overCap && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> Over your time limit
        </span>
      )}
    </button>
  );
}
