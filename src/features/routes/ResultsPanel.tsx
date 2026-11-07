import { Database, RotateCcw, Sparkles } from 'lucide-react';
import { Notice } from '../../components/Notice';
import { formatDate, formatDistance } from '../../lib/format';
import type { PlanResult } from '../../lib/routing/planner';
import type { DatasetState } from '../../hooks/useDataset';
import { RouteCard } from './RouteCard';
import { RouteDetails } from './RouteDetails';

interface ResultsPanelProps {
  dataset: DatasetState;
  onRetry: () => void;
  hasEndpoints: boolean;
  outcome: PlanResult | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTryDemo?: () => void;
  showEvidenceOnMap: boolean;
  onToggleEvidence: (on: boolean) => void;
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="skeleton h-5 w-2/3" />
      <div className="grid grid-cols-2 gap-2">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
      <div className="skeleton h-4 w-1/2" />
    </div>
  );
}

export function ResultsPanel({
  dataset,
  onRetry,
  hasEndpoints,
  outcome,
  selectedId,
  onSelect,
  onTryDemo,
  showEvidenceOnMap,
  onToggleEvidence,
}: ResultsPanelProps) {
  if (dataset.status === 'loading-manifest' || dataset.status === 'loading-graph') {
    return <LoadingSkeleton label="Loading Cork walking data…" />;
  }
  if (dataset.status === 'error') {
    return (
      <div className="space-y-3">
        <Notice tone="error" title="Walking data unavailable">
          {dataset.message} Routes cannot be calculated without it, and Solas will not guess.
        </Notice>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold hover:border-line-strong"
        >
          <RotateCcw className="size-4" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  const { manifest } = dataset;
  const footer = (
    <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-ink-subtle">
      <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {manifest.synthetic ? 'SYNTHETIC TEST DATA — not real Cork streets. ' : ''}
        {manifest.areaName}: {formatDistance(manifest.counts.totalLengthM)} of mapped walkways from OpenStreetMap
        (ODbL), retrieved {formatDate(manifest.generatedAt)}. Coverage is limited to the outlined area.
      </span>
    </p>
  );

  if (!hasEndpoints || !outcome) {
    return (
      <div>
        <h2 className="text-base font-bold">Plan a walk</h2>
        <p className="mt-1 text-sm text-ink-muted">Choose a start and destination from the list, or tap the map inside the outlined area.</p>
        {onTryDemo && (
          <button
            type="button"
            onClick={onTryDemo}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-contrast hover:bg-accent-strong"
          >
            <Sparkles className="size-4" aria-hidden="true" /> Try UCC → Parnell Place
          </button>
        )}
        {footer}
      </div>
    );
  }

  if (!outcome.ok) {
    const { error } = outcome;
    return (
      <div>
        {error.kind === 'snap' ? (
          <Notice tone="warning" title={`Can't use that ${error.which === 'origin' ? 'start' : 'destination'}`}>
            {error.failure.message}
          </Notice>
        ) : error.kind === 'same-place' ? (
          <Notice tone="info">{error.message}</Notice>
        ) : (
          <Notice tone="warning" title="No route found">
            {error.message} Solas does not draw straight-line shortcuts across rivers, buildings or private land.
          </Notice>
        )}
        {footer}
      </div>
    );
  }

  const selected = outcome.routes.find((r) => r.id === selectedId) ?? outcome.routes[0]!;
  return (
    <div className="space-y-3">
      <h2 className="sr-only">Route options</h2>
      <ul
        aria-label="Route options, side by side"
        className="grid auto-cols-[minmax(158px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {outcome.routes.map((route) => (
          <li key={route.id} className="min-w-0">
            <RouteCard route={route} selected={route.id === selected.id} onSelect={() => onSelect(route.id)} />
          </li>
        ))}
      </ul>

      {outcome.notices.map((n) => (
        <Notice key={n.id} tone={n.tone} title={n.title}>
          {n.message}
        </Notice>
      ))}

      <RouteDetails route={selected} manifest={manifest} showEvidenceOnMap={showEvidenceOnMap} onToggleEvidence={onToggleEvidence} />

      <p className="text-xs text-ink-subtle">
        Calculated on your device in {Math.max(1, Math.round(outcome.computeMs))} ms ({outcome.stats.searches} searches,{' '}
        {outcome.stats.distinctAlternatives} distinct alternative{outcome.stats.distinctAlternatives === 1 ? '' : 's'} checked).
      </p>
      {footer}
    </div>
  );
}
