import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ExternalLink, Map as MapIcon } from 'lucide-react';
import { EvidenceSwatch } from '../../components/EvidenceSwatch';
import { Notice } from '../../components/Notice';
import { Tooltip } from '../../components/Tooltip';
import { ROUTING_CONFIG } from '../../config/routing';
import { formatDate, formatDistance, formatDuration, formatSpeedKmh } from '../../lib/format';
import { LIGHTING_CLASSES, type DatasetManifest, type LightingClass } from '../../lib/graph/types';
import { googleMapsWalkingUrl } from '../../lib/handoff';
import type { RouteCandidate } from '../../lib/routing/engine';
import { extraTimeText } from '../../lib/routing/explain';
import type { RouteMode } from '../../lib/routing/preferences';
import { summariseProvenance, type ClassProvenance } from '../../lib/scoring/evidence';
import { formatShare } from '../../lib/scoring/percent';
import { AccessibilityDetails } from './AccessibilityDetails';
import { LightingBar } from './LightingBar';
import { LIGHTING_LABELS } from './lighting';
import { routeTitle } from './routeText';

const OSM = 'https://www.openstreetmap.org';

function OsmLinks({ kind, ids, max = 3 }: { kind: 'way' | 'node'; ids: number[]; max?: number }) {
  if (ids.length === 0) return null;
  return (
    <>
      {ids.slice(0, max).map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`${OSM}/${kind}/${id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate underline-offset-2 hover:underline">
            {kind} {id}
            <span className="sr-only"> (opens OpenStreetMap)</span>
          </a>
        </span>
      ))}
      {ids.length > max && ` and ${ids.length - max} more`}
    </>
  );
}

function provenanceLine(cls: LightingClass, p: ClassProvenance, radiusM: number) {
  if (cls === 'mapped_lit' || cls === 'mapped_unlit') {
    const tags = Object.keys(p.litTagValues).join(', ') || 'a lit tag';
    return (
      <>
        {p.ways.length} OSM way{p.ways.length === 1 ? '' : 's'} tagged {tags}: <OsmLinks kind="way" ids={p.ways} />
      </>
    );
  }
  if (cls === 'likely_lit') {
    return (
      <>
        {p.lamps.length} mapped street lamp{p.lamps.length === 1 ? '' : 's'} within {radiusM} m: <OsmLinks kind="node" ids={p.lamps} />
      </>
    );
  }
  return <>No lit tag and no mapped lamp within {radiusM} m.</>;
}

/** Full information for one route, opened on request from the route options. */
export function RouteDetailsView({
  route,
  manifest,
  mode,
  onBack,
}: {
  route: RouteCandidate;
  manifest: DatasetManifest;
  mode: RouteMode;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcesId = useId();
  useEffect(() => {
    headingRef.current?.focus();
  }, [route.id]);

  const m = route.metrics;
  const step = ROUTING_CONFIG.percentRoundingStep;
  const provenance = summariseProvenance(route.evidence);
  const radius = manifest.parameters?.lampRadiusMetres ?? 30;
  const title = `${routeTitle(route)} route`;

  return (
    <div className="slide-in space-y-3.5 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="pressable -ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-semibold text-slate hover:bg-fill"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Routes
      </button>

      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink outline-none">
          {title}
        </h2>
        <p className="mt-1 text-[14px] leading-snug text-ink-2">{route.rationale}</p>
      </div>

      <dl className="tnum grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-surface text-center shadow-card">
        {[
          ['Time', formatDuration(m.durationS)],
          ['vs fastest', route.roles.includes('fastest') ? 'Fastest' : extraTimeText(route.extraS)],
          ['Distance', formatDistance(m.distanceM)],
        ].map(([k, v], i) => (
          <div key={k} className={`px-2 py-2.5 ${i > 0 ? 'border-l border-line' : ''}`}>
            <dt className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">{k}</dt>
            <dd className="mt-0.5 text-[17px] font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-1.5 px-1 text-[12px] text-ink-3">Times are estimates at {formatSpeedKmh(ROUTING_CONFIG.walkingSpeedMps)}.</p>

      <section aria-labelledby="lighting-heading" className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
        <h3 id="lighting-heading" className="text-[15px] font-semibold text-ink">
          Lighting evidence, by distance
        </h3>
        <div className="mt-2.5">
          <LightingBar lighting={m.lighting} height={14} />
        </div>
        <table className="tnum mt-2 w-full text-[13px]">
          <caption className="sr-only">Metres and share of this route in each lighting evidence class</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Evidence</th>
              <th scope="col">Metres</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {LIGHTING_CLASSES.map((cls) => (
              <tr key={cls} className="border-t border-line first:border-t-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium text-ink">
                  <Tooltip content={LIGHTING_LABELS[cls].long} side="top" describe>
                    <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md text-left">
                      <EvidenceSwatch cls={cls} width={26} />
                      {LIGHTING_LABELS[cls].short}
                    </button>
                  </Tooltip>
                </th>
                <td className="py-1.5 text-right text-ink-2">{Math.round(m.lighting.metres[cls])} m</td>
                <td className="w-14 py-1.5 text-right font-semibold text-ink">
                  {formatShare(m.lighting.roundedPercent[cls], m.lighting.exactPercent[cls], step)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          aria-expanded={sourcesOpen}
          aria-controls={sourcesId}
          onClick={() => setSourcesOpen((s) => !s)}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-slate"
        >
          Where this evidence comes from
          <ChevronDown className={`size-4 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {sourcesOpen && (
          <div id={sourcesId} className="enter space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
            <ul className="space-y-1.5">
              {LIGHTING_CLASSES.filter((cls) => provenance[cls].metres >= 1).map((cls) => (
                <li key={cls}>
                  <strong className="text-ink">
                    {LIGHTING_LABELS[cls].short}, {Math.round(provenance[cls].metres)} m:
                  </strong>{' '}
                  {provenanceLine(cls, provenance[cls], radius)}
                </li>
              ))}
            </ul>
            <p>
              OpenStreetMap contributors (ODbL), retrieved {formatDate(manifest.generatedAt)}. Many lamps are not mapped, and a mapped lamp
              may be off or may not light the footway.
            </p>
          </div>
        )}
      </section>

      {route.warnings.length > 0 && (
        <Notice tone="warning" title="About this route" live={false}>
          <ul className="list-disc space-y-1 pl-4">
            {route.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <AccessibilityDetails access={route.accessibility} stepFreeRole={route.roles.includes('step_free')} defaultOpen={mode === 'easier' || mode === 'step_free'} />

      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
        <a
          href={googleMapsWalkingUrl(route.geometry.coordinates)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate px-4 text-[15px] font-semibold text-white hover:bg-slate-strong"
        >
          <MapIcon className="size-4" aria-hidden="true" />
          Open in Google Maps
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens Google Maps in a new tab)</span>
        </a>
        <p className="mt-2 text-[12px] leading-snug text-ink-3">
          Approximate: Google Maps recalculates the walk from a few points on this route, so its path can differ.
        </p>
      </div>

      <p className="px-1 text-[12px] text-ink-3">
        Calculated on your device from OpenStreetMap data retrieved {formatDate(manifest.generatedAt)}.
      </p>
    </div>
  );
}
