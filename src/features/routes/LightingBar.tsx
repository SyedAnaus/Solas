import { LIGHTING_CLASSES } from '../../lib/graph/types';
import type { LightingBreakdown } from '../../lib/scoring/metrics';
import { LIGHTING_TUBE_STYLE, lightingSummaryText } from './lighting';

/**
 * The route's lighting as a miniature of the map "tube": stretches in proportion to distance,
 * each with the same pattern as on the map. Spoken as a full text summary.
 */
export function LightingBar({ lighting, height = 10 }: { lighting: LightingBreakdown; height?: number }) {
  return (
    <div
      role="img"
      aria-label={`Lighting evidence: ${lightingSummaryText(lighting)}.`}
      className="flex w-full overflow-hidden rounded-full bg-ev-tube"
      style={{ height }}
    >
      {LIGHTING_CLASSES.map((cls) =>
        lighting.exactPercent[cls] > 0 ? (
          <div key={cls} className="h-full" style={{ width: `${lighting.exactPercent[cls]}%`, ...LIGHTING_TUBE_STYLE[cls] }} />
        ) : null,
      )}
    </div>
  );
}
