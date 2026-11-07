import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { EvidenceSwatch } from '../../components/EvidenceSwatch';
import { Tooltip } from '../../components/Tooltip';
import { LIGHTING_CLASSES } from '../../lib/graph/types';
import { LIGHTING_LABELS } from '../routes/lighting';

/**
 * On-map key for the lighting tube. Each item has a pattern, a text label and a tooltip rule.
 * On phones it starts as a small "Key" chip and expands on tap, to keep the map clear.
 */
export function EvidenceLegend({ style, collapsible = false, onHeightChange }: { style?: CSSProperties; collapsible?: boolean; onHeightChange?: (height: number) => void }) {
  const [open, setOpen] = useState(!collapsible);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onHeightChange?.(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);
  const listId = useId();
  return (
    <div ref={ref} className="glass pointer-events-auto absolute z-10 rounded-2xl enter" style={style} role="group" aria-label="Lighting evidence key">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 items-center gap-2 rounded-2xl pl-3 pr-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2"
        >
          <span className="flex gap-0.5" aria-hidden="true">
            <EvidenceSwatch cls="mapped_lit" width={14} />
            <EvidenceSwatch cls="likely_lit" width={14} />
            <EvidenceSwatch cls="unknown" width={14} />
          </span>
          Lighting key
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      ) : (
        <p className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">Lighting evidence</p>
      )}
      {open && (
        <ul id={listId} className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-2.5 pt-1.5">
          {LIGHTING_CLASSES.map((cls) => (
            <li key={cls}>
              <Tooltip content={LIGHTING_LABELS[cls].long} side="bottom" describe>
                <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-md text-[12px] font-medium text-ink">
                  <EvidenceSwatch cls={cls} width={24} />
                  {LIGHTING_LABELS[cls].short}
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
