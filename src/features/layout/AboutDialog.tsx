import { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { EvidenceSwatch } from '../../components/EvidenceSwatch';
import { IconButton } from '../../components/IconButton';
import { Switch } from '../../components/Switch';
import { ROUTING_CONFIG } from '../../config/routing';
import { formatDate, formatDistance, formatSpeedKmh } from '../../lib/format';
import { LIGHTING_CLASSES, type DatasetManifest } from '../../lib/graph/types';
import { LIGHTING_LABELS } from '../routes/lighting';

const REPO = 'https://github.com/SyedAnaus/Solas';

/** About, data sources and settings, in a native modal dialog (focus trap and Escape built in). */
export function AboutDialog({
  open,
  onClose,
  manifest,
  reduceMotion,
  systemReduce,
  onReduceMotion,
}: {
  open: boolean;
  onClose: () => void;
  manifest: DatasetManifest | null;
  reduceMotion: boolean;
  systemReduce: boolean;
  onReduceMotion: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const unknownPct = manifest ? Math.round((manifest.lightingMetres.unknown / manifest.counts.totalLengthM) * 100) : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="about-title"
      onClose={onClose}
      onCancel={onClose}
      className="glass-strong m-auto max-h-[88dvh] w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-[28px] p-0 text-ink"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <BrandMark size={32} />
        <h2 id="about-title" className="flex-1 text-[17px] font-semibold">
          About Solas
        </h2>
        <IconButton label="Close" onClick={onClose} variant="filled" tooltipSide="left">
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      <div className="scroll-y max-h-[calc(88dvh-68px)] space-y-5 px-5 py-4 text-[14px] leading-relaxed text-ink-2">
        <p>
          Solas compares walking routes in a small part of Cork City. Next to the fastest walk it can show a route with more mapped
          lighting, an easier one, or one that avoids mapped steps, and it says plainly what the map data does not know.
        </p>

        <section aria-labelledby="about-lighting">
          <h3 id="about-lighting" className="mb-2 text-[15px] font-semibold text-ink">
            How lighting is shown
          </h3>
          <ul className="space-y-1.5">
            {LIGHTING_CLASSES.map((cls) => (
              <li key={cls} className="flex items-start gap-2.5">
                <span className="mt-1.5">
                  <EvidenceSwatch cls={cls} />
                </span>
                <span>{LIGHTING_LABELS[cls].long}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-data">
          <h3 id="about-data" className="mb-2 text-[15px] font-semibold text-ink">
            Data and coverage
          </h3>
          {manifest ? (
            <p>
              {manifest.areaName}: {formatDistance(manifest.counts.totalLengthM)} of mapped walkways and {manifest.counts.lampsMapped} mapped
              street lamps from OpenStreetMap, retrieved {formatDate(manifest.generatedAt)}. {unknownPct}% of walkway length in this area has
              no lighting information. Routes outside the dashed outline are not supported.
            </p>
          ) : (
            <p>The walking data has not loaded yet.</p>
          )}
          <p className="mt-2">
            Map data © OpenStreetMap contributors (ODbL). Basemap by OpenFreeMap, © OpenMapTiles. Times are estimates at{' '}
            {formatSpeedKmh(ROUTING_CONFIG.walkingSpeedMps)}.
          </p>
        </section>

        <section aria-labelledby="about-limits">
          <h3 id="about-limits" className="mb-2 text-[15px] font-semibold text-ink">
            What Solas does not claim
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>It does not say any route is safe. Lighting data is incomplete and a mapped lamp may be off.</li>
            <li>Step-free routes avoid mapped steps and barriers but are not certified accessible.</li>
            <li>Gradient information is unavailable: there is no trustworthy elevation data.</li>
          </ul>
        </section>

        <section aria-labelledby="about-settings">
          <h3 id="about-settings" className="mb-1 text-[15px] font-semibold text-ink">
            Settings
          </h3>
          <Switch
            label="Reduce motion"
            description={systemReduce ? 'On because your device asks for reduced motion.' : 'Turns off map flights and panel animations.'}
            checked={reduceMotion}
            disabled={systemReduce}
            onChange={onReduceMotion}
          />
        </section>

        <p>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-slate underline-offset-2 hover:underline">
            Source code, data sources and methods
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="sr-only">(opens GitHub)</span>
          </a>
        </p>
      </div>
    </dialog>
  );
}
