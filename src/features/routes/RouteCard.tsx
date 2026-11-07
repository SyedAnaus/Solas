import { Accessibility, AlertTriangle, Check, Footprints, Lightbulb, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { TRACK } from '../../config/theme';
import { formatDistance, formatDuration } from '../../lib/format';
import type { RouteCandidate } from '../../lib/routing/engine';
import { extraTimeText, headlineLitPct } from '../../lib/routing/explain';
import { MODE_LABEL, type RouteMode, type RouteRole } from '../../lib/routing/preferences';
import { trackOf } from '../map/track';
import { LightingBar } from './LightingBar';
import { routeAccessibleSummary } from './routeText';

const ROLE_ICON: Record<RouteRole, ReactNode> = {
  fastest: <Timer className="size-3.5" aria-hidden="true" />,
  better_lit: <Lightbulb className="size-3.5" aria-hidden="true" />,
  easier: <Footprints className="size-3.5" aria-hidden="true" />,
  step_free: <Accessibility className="size-3.5" aria-hidden="true" />,
};

/**
 * Compact route option. Identity = track swatch + role label; selection = dark ring + check badge;
 * lighting = the evidence tube. The three never share a visual channel.
 */
export function RouteCard({ route, selected, mode, onSelect }: { route: RouteCandidate; selected: boolean; mode: RouteMode; onSelect: () => void }) {
  const m = route.metrics;
  const isFastest = route.roles.includes('fastest');
  const flights = route.accessibility.steps.flights;
  const showSteps = flights > 0 || mode === 'easier' || mode === 'step_free';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={routeAccessibleSummary(route)}
      data-route-id={route.id}
      className={`pressable relative flex h-full w-full flex-col rounded-[20px] p-3 text-left ${
        selected
          ? 'bg-surface shadow-[0_0_0_2px_var(--ink),0_10px_24px_-12px_rgb(31_35_80/0.45)]'
          : 'bg-surface/70 shadow-[0_0_0_1px_var(--line-strong)] hover:bg-surface hover:shadow-[0_0_0_1px_var(--line-strong),0_6px_16px_-10px_rgb(31_35_80/0.35)]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 pr-7 text-[12.5px] font-semibold text-ink">
        <span aria-hidden="true" className="h-[5px] w-4 shrink-0 rounded-full" style={{ background: TRACK[trackOf(route)].line }} />
        {ROLE_ICON[route.roles[route.roles.length - 1]!]}
        <span className="leading-snug">{route.roles.map((r) => MODE_LABEL[r]).join(' · ')}</span>
      </span>
      {selected && (
        <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-ink text-white" aria-hidden="true">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
      <span className="tnum mt-2 text-[26px] font-bold leading-none tracking-[-0.02em] text-ink">{formatDuration(m.durationS)}</span>
      <span className="tnum mt-1 text-[12.5px] font-medium text-ink-2">
        {isFastest ? 'Fastest' : extraTimeText(route.extraS)} · {formatDistance(m.distanceM)}
      </span>
      <span className="mt-2.5 block">
        <LightingBar lighting={m.lighting} height={8} />
      </span>
      <span className="tnum mt-1.5 text-[12px] leading-tight text-ink-2">
        <strong className="font-bold text-ink">{headlineLitPct(m)}%</strong> mapped or likely lit
      </span>
      {showSteps && (
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-ink-2">
          <Footprints className="size-3.5 shrink-0" aria-hidden="true" />
          {flights === 0 ? 'No mapped steps' : `${flights} set${flights === 1 ? '' : 's'} of steps`}
        </span>
      )}
      {route.roles.includes('step_free') && (
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-slate">
          <Accessibility className="size-3.5 shrink-0" aria-hidden="true" /> Not certified
        </span>
      )}
      {route.overCap && (
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-orange-text">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> Over your limit
        </span>
      )}
    </button>
  );
}
