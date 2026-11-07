import { ChevronDown, ExternalLink, Info } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '../../components/Notice';
import { Switch } from '../../components/Switch';
import { ROUTING_CONFIG } from '../../config/routing';
import { formatDate, formatDistance, formatDuration, formatSpeedKmh } from '../../lib/format';
import { LIGHTING_CLASSES, type DatasetManifest, type LightingClass } from '../../lib/graph/types';
import type { RouteCandidate } from '../../lib/routing/engine';
import { extraTimeText } from '../../lib/routing/explain';
import { summariseProvenance } from '../../lib/scoring/evidence';
import { formatShare } from '../../lib/scoring/percent';
import { LightingBar } from './LightingBar';
import { LIGHTING_LABELS } from './lighting';
import { routeTitle } from './routeText';

const OSM = 'https://www.openstreetmap.org';

function OsmLinks({ kind, ids, max = 3 }: { kind: 'way' | 'node'; ids: number[]; max?: number }) {
  if (ids.length === 0) return null;
  return (
    <span>
      {ids.slice(0, max).map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`${OSM}/${kind}/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-accent underline-offset-2 hover:underline">
            {kind} {id}
            <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(opens OpenStreetMap)</span>
          </a>
        </span>
      ))}
      {ids.length > max && ` and ${ids.length - max} more`}
    </span>
  );
}

function provenanceText(cls: LightingClass, p: ReturnType<typeof summariseProvenance>[LightingClass], radiusM: number) {
  switch (cls) {
    case 'mapped_lit':
    case 'mapped_unlit': {
      const tags = Object.keys(p.litTagValues).join(', ') || 'lit tag';
      return (
        <>
          {p.ways.length} OSM way{p.ways.length === 1 ? '' : 's'} tagged {tags}: <OsmLinks kind="way" ids={p.ways} />
        </>
      );
    }
    case 'likely_lit':
      return (
        <>
          {p.lamps.length} mapped street lamp{p.lamps.length === 1 ? '' : 's'} within {radiusM} m: <OsmLinks kind="node" ids={p.lamps} />
        </>
      );
    case 'unknown':
      return <>No lit tag and no mapped lamp within {radiusM} m.</>;
  }
}

export function RouteDetails({
  route,
  manifest,
  showEvidenceOnMap,
  onToggleEvidence,
}: {
  route: RouteCandidate;
  manifest: DatasetManifest;
  showEvidenceOnMap: boolean;
  onToggleEvidence: (on: boolean) => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const m = route.metrics;
  const step = ROUTING_CONFIG.percentRoundingStep;
  const provenance = summariseProvenance(route.evidence);
  const areaUnknownPct = Math.round((manifest.lightingMetres.unknown / manifest.counts.totalLengthM) * 100);

  return (
    <section aria-labelledby="route-details-heading" className="space-y-3">
      <div>
        <h3 id="route-details-heading" className="text-base font-bold">
          {routeTitle(route)} route
        </h3>
        <p className="mt-0.5 text-sm text-ink-muted">{route.rationale}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-raised p-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Time</dt>
          <dd className="text-base font-extrabold">{formatDuration(m.durationS)}</dd>
        </div>
        <div className="rounded-xl bg-surface-raised p-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Extra</dt>
          <dd className="text-base font-extrabold">{route.roles.includes('fastest') ? '—' : extraTimeText(route.extraS)}</dd>
        </div>
        <div className="rounded-xl bg-surface-raised p-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Distance</dt>
          <dd className="text-base font-extrabold">{formatDistance(m.distanceM)}</dd>
        </div>
      </dl>
      <p className="text-xs text-ink-subtle">Times are estimates at {formatSpeedKmh(ROUTING_CONFIG.walkingSpeedMps)}.</p>

      <div>
        <h4 className="mb-2 text-sm font-bold">Lighting evidence, by distance</h4>
        <LightingBar lighting={m.lighting} />
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">Metres of this route in each lighting evidence class</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Metres</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {LIGHTING_CLASSES.map((cls) => (
              <tr key={cls} className="border-t border-line first:border-t-0">
                <th scope="row" className="py-1 pr-2 text-left font-medium text-ink-muted">
                  {LIGHTING_LABELS[cls].long}
                </th>
                <td className="py-1 text-right tabular-nums">{Math.round(m.lighting.metres[cls])} m</td>
                <td className="w-12 py-1 text-right font-semibold tabular-nums">
                  {formatShare(m.lighting.roundedPercent[cls], m.lighting.exactPercent[cls], step)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {route.warnings.length > 0 && (
        <Notice tone="warning" title="About this route's data">
          <ul className="list-disc space-y-1 pl-4">
            {route.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Switch label="Show lighting evidence on the map" checked={showEvidenceOnMap} onChange={onToggleEvidence} />

      <div className="rounded-xl border border-line">
        <button
          type="button"
          aria-expanded={showSources}
          onClick={() => setShowSources((s) => !s)}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-sm font-semibold"
        >
          <Info className="size-4 text-accent" aria-hidden="true" />
          Where the evidence comes from
          <ChevronDown className={`ml-auto size-4 transition-transform ${showSources ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showSources && (
          <div className="space-y-2 border-t border-line p-3 text-xs leading-relaxed text-ink-muted">
            <ul className="space-y-1.5">
              {LIGHTING_CLASSES.filter((cls) => provenance[cls].metres >= 1).map((cls) => (
                <li key={cls}>
                  <strong className="text-ink">
                    {LIGHTING_LABELS[cls].short}, {Math.round(provenance[cls].metres)} m:
                  </strong>{' '}
                  {provenanceText(cls, provenance[cls], manifest.parameters?.lampRadiusMetres ?? 30)}
                </li>
              ))}
            </ul>
            <p>
              Source: OpenStreetMap contributors (ODbL), retrieved {formatDate(manifest.generatedAt)}. In this area {areaUnknownPct}% of
              mapped walkways have no lighting information, and many street lamps are not mapped. A mapped lamp does not prove it is
              working or that it lights the footway.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
