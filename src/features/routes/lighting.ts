import type { CSSProperties } from 'react';
import { ROUTING_CONFIG } from '../../config/routing';
import { LIGHTING_CLASSES, type LightingClass } from '../../lib/graph/types';
import type { LightingBreakdown } from '../../lib/scoring/metrics';
import { formatShare } from '../../lib/scoring/percent';

export const LIGHTING_LABELS: Record<LightingClass, { short: string; long: string }> = {
  mapped_lit: { short: 'Mapped lit', long: 'Mapped lit: the street is tagged lit=yes in OpenStreetMap.' },
  likely_lit: { short: 'Likely lit', long: 'Likely lit: no lighting tag, but a mapped street lamp is within 30 m. Inferred, not confirmed.' },
  mapped_unlit: { short: 'Mapped unlit', long: 'Mapped unlit: the street is tagged lit=no in OpenStreetMap.' },
  unknown: { short: 'Unknown', long: 'Unknown: no lighting information. This is not the same as dark.' },
};

/** CSS for one tube segment, matching the map and EvidenceSwatch patterns. */
export const LIGHTING_TUBE_STYLE: Record<LightingClass, CSSProperties> = {
  mapped_lit: { background: 'linear-gradient(var(--ev-tube) 0 28%, var(--ev-lit) 28% 72%, var(--ev-tube) 72%)' },
  likely_lit: {
    backgroundColor: 'var(--ev-tube)',
    backgroundImage: 'repeating-linear-gradient(90deg, var(--ev-likely) 0 6px, transparent 6px 10px)',
    backgroundSize: '100% 44%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  mapped_unlit: { background: 'linear-gradient(var(--ev-tube) 0 28%, #f19a94 28% 72%, var(--ev-tube) 72%)' },
  unknown: {
    backgroundColor: 'var(--ev-tube)',
    backgroundImage: 'radial-gradient(circle, #ffffff 1.3px, transparent 1.7px)',
    backgroundSize: '7px 100%',
    backgroundRepeat: 'repeat-x',
    backgroundPosition: '2px center',
  },
};

export function lightingSummaryText(lighting: LightingBreakdown): string {
  const step = ROUTING_CONFIG.percentRoundingStep;
  return LIGHTING_CLASSES.map(
    (cls) => `${LIGHTING_LABELS[cls].short} ${formatShare(lighting.roundedPercent[cls], lighting.exactPercent[cls], step)}`,
  ).join(', ');
}
