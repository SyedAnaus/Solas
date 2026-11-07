import { Accessibility, Footprints, Mountain, TriangleAlert } from 'lucide-react';
import type { AccessibilitySummary } from '../../lib/scoring/accessibility';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function stepsText(a: AccessibilitySummary): string {
  if (a.steps.flights === 0) return 'No mapped steps.';
  const sets = `${a.steps.flights} set${a.steps.flights === 1 ? '' : 's'} of mapped steps`;
  const count = a.steps.stepCount ? `, about ${a.steps.stepCount} steps` : ', step count not mapped';
  return `${sets} (${Math.round(a.steps.metres)} m${count}).`;
}

/** Difficult sections and data gaps for one route, from OSM tags only. */
export function AccessibilityDetails({ access, stepFreeRole }: { access: AccessibilitySummary; stepFreeRole: boolean }) {
  const difficult: string[] = [];
  for (const [surface, m] of Object.entries(access.roughSurfaces)) difficult.push(`Rough surface (${surface.replace(/_/g, ' ')}): ${Math.round(m)} m`);
  if (access.badSmoothnessM >= 1) difficult.push(`Mapped as uneven: ${Math.round(access.badSmoothnessM)} m`);
  if (access.slope.steepTaggedM >= 1) difficult.push(`Mapped as steep by an OSM incline tag: ${Math.round(access.slope.steepTaggedM)} m`);
  if (access.wheelchair.limitedM >= 1) difficult.push(`Tagged wheelchair=limited: ${Math.round(access.wheelchair.limitedM)} m`);
  if (access.wheelchair.noM >= 1) difficult.push(`Tagged wheelchair=no: ${Math.round(access.wheelchair.noM)} m`);
  if (access.kerbs.raised > 0) difficult.push(`${access.kerbs.raised} raised kerb${access.kerbs.raised === 1 ? '' : 's'}`);

  const gaps: string[] = ['Gradient information unavailable: Solas has no trustworthy elevation data.'];
  const unknownSurface = pct(access.surface.unknown, access.totalM);
  if (unknownSurface > 0) gaps.push(`Surface not mapped on ${unknownSurface}% of the route.`);
  if (access.crossings.total > 0) {
    gaps.push(
      access.crossings.kerbUnknown > 0
        ? `Kerb information missing at ${access.crossings.kerbUnknown} of ${access.crossings.total} crossings.`
        : `Kerb information mapped at all ${access.crossings.total} crossings.`,
    );
  }
  const widthUnknown = pct(access.totalM - access.widthKnownM, access.totalM);
  if (widthUnknown > 0) gaps.push(`Path width not mapped on ${widthUnknown}% of the route.`);
  const gates = access.barriers.gate ?? 0;
  if (gates > 0) gaps.push(`${gates} mapped gate${gates === 1 ? '' : 's'}; opening times are not known.`);

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-bold">
        <Footprints className="size-4 text-teal" aria-hidden="true" /> Steps, surfaces and slope
      </h4>
      <p className="text-sm text-ink-muted">{stepsText(access)}</p>
      {difficult.length > 0 ? (
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold text-ink">
            <TriangleAlert className="size-3.5 text-amber" aria-hidden="true" /> Difficult sections (mapped)
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
            {difficult.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">No rough surfaces, steep incline tags or wheelchair restrictions are mapped on this route.</p>
      )}
      <div>
        <p className="flex items-center gap-1 text-xs font-semibold text-ink">
          <Mountain className="size-3.5 text-ink-subtle" aria-hidden="true" /> Data gaps
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
          {gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      {stepFreeRole && (
        <p className="flex items-start gap-1.5 rounded-xl border border-teal/40 bg-teal-soft p-2.5 text-xs leading-snug text-ink">
          <Accessibility className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
          <span>
            <strong>Step-free by mapped data, not certified accessible.</strong> It avoids every mapped step, mapped barrier and path
            tagged wheelchair=no, but unmapped kerbs, slopes, widths and obstacles may still make it unsuitable.
          </span>
        </p>
      )}
    </div>
  );
}
