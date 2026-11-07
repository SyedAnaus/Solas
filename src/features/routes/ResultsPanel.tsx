import { ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { Notice } from '../../components/Notice';
import type { DatasetState } from '../../hooks/useDataset';
import type { PlanResult } from '../../lib/routing/planner';
import type { RouteMode } from '../../lib/routing/preferences';
import { RouteCard } from './RouteCard';
import { routeTitle } from './routeText';

export function LoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Loading Cork walking data…</span>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="skeleton h-[150px] rounded-[20px]" />
        <div className="skeleton h-[150px] rounded-[20px]" />
      </div>
      <div className="skeleton h-11 rounded-full" />
    </div>
  );
}

interface ResultsPanelProps {
  dataset: DatasetState;
  onRetry: () => void;
  hasEndpoints: boolean;
  outcome: PlanResult | null;
  selectedId: string | null;
  mode: RouteMode;
  onSelect: (id: string) => void;
  onOpenDetails: () => void;
  onTryDemo?: () => void;
}

/** Route options for the current trip, or the right empty / loading / error state. */
export function ResultsPanel({ dataset, onRetry, hasEndpoints, outcome, selectedId, mode, onSelect, onOpenDetails, onTryDemo }: ResultsPanelProps) {
  if (dataset.status === 'loading-manifest' || dataset.status === 'loading-graph') return <LoadingSkeleton />;
  if (dataset.status === 'error') {
    return (
      <div className="space-y-3">
        <Notice tone="error" title="Walking data unavailable">
          {dataset.message} Routes cannot be calculated without it, and Solas will not guess.
        </Notice>
        <button type="button" onClick={onRetry} className="pressable inline-flex min-h-11 items-center gap-2 rounded-full bg-fill px-4 font-semibold text-ink hover:bg-link-water">
          <RotateCcw className="size-4" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  if (!hasEndpoints || !outcome) {
    return (
      <div className="rounded-2xl bg-cream-soft p-4">
        <h2 className="text-[17px] font-semibold text-ink">Plan a walk</h2>
        <p className="mt-1 text-[14px] leading-snug text-ink-2">Choose two places above, or tap the map inside the dashed area.</p>
        {onTryDemo && (
          <button
            type="button"
            onClick={onTryDemo}
            className="pressable mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-white hover:bg-slate-strong"
          >
            <Sparkles className="size-4 text-[#ffc629]" aria-hidden="true" /> Try UCC → Parnell Place
          </button>
        )}
      </div>
    );
  }

  if (!outcome.ok) {
    const { error } = outcome;
    if (error.kind === 'snap') return null; // shown next to the field it belongs to
    return error.kind === 'same-place' ? (
      <Notice tone="info">{error.message}</Notice>
    ) : (
      <Notice tone="warning" title="No route found">
        {error.message} Solas does not draw straight-line shortcuts across rivers, buildings or private land.
      </Notice>
    );
  }

  const selected = outcome.routes.find((r) => r.id === selectedId) ?? outcome.routes[0]!;
  const many = outcome.routes.length > 2;
  return (
    <div className="space-y-3">
      <h2 className="sr-only">Route options</h2>
      <ul
        aria-label="Route options"
        className={many ? 'scroll-x -mx-4 grid auto-cols-[minmax(152px,46%)] grid-flow-col gap-2.5 px-4 pb-1 pt-0.5' : 'grid grid-cols-2 gap-2.5 pt-0.5'}
      >
        {outcome.routes.map((route) => (
          <li key={route.id} className={`min-w-0 ${outcome.routes.length === 1 ? 'col-span-2' : ''}`}>
            <RouteCard route={route} selected={route.id === selected.id} mode={mode} onSelect={() => onSelect(route.id)} />
          </li>
        ))}
      </ul>

      {outcome.notices.map((n) => (
        <Notice key={n.id} tone={n.tone} title={n.title}>
          {n.message}
        </Notice>
      ))}

      <button
        id="route-details-button"
        type="button"
        onClick={onOpenDetails}
        className="pressable flex min-h-12 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-left text-[15px] font-semibold text-ink shadow-card hover:bg-surface-2"
      >
        <span className="flex-1">
          Route details
          <span className="block text-[12.5px] font-medium text-ink-2">{routeTitle(selected)} · lighting, steps, sources</span>
        </span>
        <ChevronRight className="size-5 text-ink-3" aria-hidden="true" />
      </button>
    </div>
  );
}
