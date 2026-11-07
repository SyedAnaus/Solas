import { ROUTING_CONFIG } from '../../config/routing';
import { LIGHTING_CLASSES } from '../../lib/graph/types';
import type { LightingBreakdown } from '../../lib/scoring/metrics';
import { LIGHTING_LABELS, LIGHTING_SWATCH, lightingSummaryText } from './lighting';
import { formatShare } from '../../lib/scoring/percent';

export function LightingBar({ lighting, compact = false }: { lighting: LightingBreakdown; compact?: boolean }) {
  const step = ROUTING_CONFIG.percentRoundingStep;
  return (
    <div>
      <div
        role="img"
        aria-label={`Lighting evidence along this route: ${lightingSummaryText(lighting)}.`}
        className="flex h-3 w-full overflow-hidden rounded-full border border-line"
      >
        {LIGHTING_CLASSES.map((cls) =>
          lighting.exactPercent[cls] > 0 ? (
            <div key={cls} className={`h-full ${LIGHTING_SWATCH[cls]}`} style={{ width: `${lighting.exactPercent[cls]}%` }} />
          ) : null,
        )}
      </div>
      {!compact && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-muted" aria-hidden="true">
          {LIGHTING_CLASSES.map((cls) => (
            <li key={cls} className="flex items-center gap-1.5">
              <span className={`inline-block size-3 shrink-0 rounded-sm border border-line ${LIGHTING_SWATCH[cls]}`} />
              <span className="truncate">{LIGHTING_LABELS[cls].short}</span>
              <span className="ml-auto font-semibold text-ink">
                {formatShare(lighting.roundedPercent[cls], lighting.exactPercent[cls], step)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
