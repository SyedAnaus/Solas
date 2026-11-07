import { Footprints, Timer } from 'lucide-react';
import { ROUTING_CONFIG } from '../../config/routing';
import { formatDistance, formatDuration, formatSpeedKmh } from '../../lib/format';
import type { RouteCandidate } from '../../lib/routing/engine';
import { LightingBar } from './LightingBar';
import { lightingSummaryText } from './lighting';

const PREFERENCE_LABEL: Record<string, string> = {
  fastest: 'Fastest',
  better_lit: 'Better lit',
  easier: 'Easier walking',
  step_free: 'Step-free',
};

export function RouteCard({ route, selected, onSelect }: { route: RouteCandidate; selected: boolean; onSelect: () => void }) {
  const title = route.preferences.map((p) => PREFERENCE_LABEL[p] ?? p).join(' · ');
  const m = route.metrics;
  const stepsText =
    m.steps.segments === 0 ? 'No mapped steps' : `${m.steps.segments} flight${m.steps.segments === 1 ? '' : 's'} of mapped steps`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${title} route: about ${formatDuration(m.durationS)}, ${formatDistance(m.distanceM)}. ${lightingSummaryText(m.lighting)}. ${stepsText}.`}
      className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent text-accent-contrast" aria-hidden="true">
          <Timer className="size-4" />
        </span>
        <span className="font-bold">{title}</span>
        {selected && (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-contrast">
            Selected
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tracking-tight">{formatDuration(m.durationS)}</span>
        <span className="text-sm text-ink-muted">{formatDistance(m.distanceM)}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-subtle">Estimate at {formatSpeedKmh(ROUTING_CONFIG.walkingSpeedMps)} walking pace</p>
      <div className="mt-3">
        <LightingBar lighting={m.lighting} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
        <Footprints className="size-3.5" aria-hidden="true" />
        {stepsText}
      </p>
      <p className="mt-1.5 text-sm text-ink-muted">{route.rationale}</p>
    </button>
  );
}
