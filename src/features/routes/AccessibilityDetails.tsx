import { useId, useState } from 'react';
import { Accessibility, ChevronDown } from 'lucide-react';
import type { AccessibilitySummary } from '../../lib/scoring/accessibility';

const share = (part: number, whole: number) => {
  const percent = whole > 0 ? (part / whole) * 100 : 0;
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
};

function stepsText(a: AccessibilitySummary): string {
  if (a.steps.flights === 0) return 'No mapped steps';
  const sets = `${a.steps.flights} set${a.steps.flights === 1 ? '' : 's'} of mapped steps`;
  return a.steps.stepCount ? `${sets}, about ${a.steps.stepCount} steps` : `${sets} (step count not mapped)`;
}

/** Steps, difficult sections and data gaps. Summary first; detail on request. */
export function AccessibilityDetails({ access, stepFreeRole, defaultOpen }: { access: AccessibilitySummary; stepFreeRole: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const difficult: string[] = [];
  for (const [surface, m] of Object.entries(access.roughSurfaces)) difficult.push(`Rough surface (${surface.replace(/_/g, ' ')}): ${Math.round(m)} m`);
  if (access.badSmoothnessM >= 1) difficult.push(`Mapped as uneven: ${Math.round(access.badSmoothnessM)} m`);
  if (access.slope.steepTaggedM >= 1) difficult.push(`Tagged steep in OSM: ${Math.round(access.slope.steepTaggedM)} m`);
  if (access.wheelchair.limitedM >= 1) difficult.push(`Tagged wheelchair=limited: ${Math.round(access.wheelchair.limitedM)} m`);
  if (access.wheelchair.noM >= 1) difficult.push(`Tagged wheelchair=no: ${Math.round(access.wheelchair.noM)} m`);
  if (access.kerbs.raised > 0) difficult.push(`${access.kerbs.raised} raised kerb${access.kerbs.raised === 1 ? '' : 's'}`);

  const gaps: string[] = ['Gradient information unavailable (no trustworthy elevation data).'];
  if (access.surface.unknown > 0) gaps.push(`Surface not mapped on ${share(access.surface.unknown, access.totalM)}.`);
  if (access.crossings.total > 0) {
    gaps.push(
      access.crossings.kerbUnknown > 0
        ? `No kerb information at ${access.crossings.kerbUnknown} of ${access.crossings.total} crossings.`
        : `Kerb information at all ${access.crossings.total} crossings.`,
    );
  }
  const widthUnknown = Math.max(0, access.totalM - access.widthKnownM);
  if (widthUnknown > 0) gaps.push(`Path width not mapped on ${share(widthUnknown, access.totalM)}.`);
  const gates = access.barriers.gate ?? 0;
  if (gates > 0) gaps.push(`${gates} mapped gate${gates === 1 ? '' : 's'}; opening times unknown.`);

  const summary = [stepsText(access), difficult.length ? 'mapped walking difficulties' : 'no mapped difficult sections'].join(' · ');

  return (
    <section aria-labelledby="access-heading" className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <h3 id="access-heading" className="text-[15px] font-semibold text-ink">
        Steps, surfaces and slope
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-2">{summary}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-slate"
      >
        {open ? 'Hide details' : 'Difficult sections and data gaps'}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="enter space-y-3 text-[13px] text-ink-2">
          {difficult.length > 0 && (
            <div>
              <h4 className="font-semibold text-ink">Difficult sections (mapped)</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {difficult.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="font-semibold text-ink">Data gaps</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {stepFreeRole && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-link-water/60 p-2.5 text-[12.5px] leading-snug text-ink">
          <Accessibility className="mt-0.5 size-4 shrink-0 text-slate" aria-hidden="true" />
          <span>
            <strong>Step-free by mapped data, not certified accessible.</strong> It avoids mapped steps, confirmed blocking barriers and paths tagged
            wheelchair=no, but unmapped kerbs, slopes, widths and obstacles may still make it unsuitable.
          </span>
        </p>
      )}
    </section>
  );
}
