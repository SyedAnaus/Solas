import { EVIDENCE } from '../config/theme';
import type { LightingClass } from '../lib/graph/types';

/**
 * A short piece of the map's lighting "tube" for one evidence class. The same pattern is used on
 * the map, in the legend and in the route bars, so the key is learned once.
 */
export function EvidenceSwatch({ cls, width = 28 }: { cls: LightingClass; width?: number }) {
  const h = 10;
  const y = h / 2;
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true" focusable="false" className="shrink-0">
      <line x1={y} y1={y} x2={width - y} y2={y} stroke={EVIDENCE.tube} strokeWidth={h} strokeLinecap="round" />
      {cls === 'mapped_lit' && <line x1={y} y1={y} x2={width - y} y2={y} stroke={EVIDENCE.litYellow} strokeWidth={4.5} />}
      {cls === 'likely_lit' && <line x1={y} y1={y} x2={width - y} y2={y} stroke={EVIDENCE.likelyMint} strokeWidth={4.5} strokeDasharray="5 3.5" />}
      {cls === 'mapped_unlit' && <line x1={y} y1={y} x2={width - y} y2={y} stroke={EVIDENCE.unlitCore} strokeWidth={4.5} />}
      {cls === 'unknown' && (
        <line x1={y + 1} y1={y} x2={width - y} y2={y} stroke={EVIDENCE.unknownDot} strokeWidth={3} strokeDasharray="0.1 5.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
