import { ROUTING_CONFIG } from '../../config/routing';
import { LIGHTING_CLASSES, type LightingClass } from '../../lib/graph/types';
import type { LightingBreakdown } from '../../lib/scoring/metrics';
import { formatShare } from '../../lib/scoring/percent';

export const LIGHTING_LABELS: Record<LightingClass, { short: string; long: string }> = {
  mapped_lit: { short: 'Mapped lit', long: 'Mapped as lit in OpenStreetMap (lit=yes)' },
  likely_lit: { short: 'Likely lit', long: 'Near a mapped street lamp; inferred, not confirmed' },
  mapped_unlit: { short: 'Mapped unlit', long: 'Mapped as unlit in OpenStreetMap (lit=no)' },
  unknown: { short: 'Unknown', long: 'No lighting information. This is not the same as dark.' },
};

/** Fill + pattern per class so the bar never relies on colour alone. */
export const LIGHTING_SWATCH: Record<LightingClass, string> = {
  mapped_lit: 'bg-amber',
  likely_lit: 'bg-[repeating-linear-gradient(135deg,var(--amber)_0_4px,transparent_4px_8px)] bg-amber-soft',
  mapped_unlit: 'bg-[repeating-linear-gradient(90deg,var(--text-muted)_0_2px,transparent_2px_6px)] bg-surface-raised',
  unknown: 'bg-[radial-gradient(var(--text-subtle)_1px,transparent_1.5px)] [background-size:5px_5px] bg-surface-raised',
};

export function lightingSummaryText(lighting: LightingBreakdown): string {
  const step = ROUTING_CONFIG.percentRoundingStep;
  return LIGHTING_CLASSES.map(
    (cls) => `${LIGHTING_LABELS[cls].short} ${formatShare(lighting.roundedPercent[cls], lighting.exactPercent[cls], step)}`,
  ).join(', ');
}
