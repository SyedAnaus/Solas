import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type Detent = 'peek' | 'medium' | 'large';
const ORDER: Detent[] = ['peek', 'medium', 'large'];
const DETENT_LABEL: Record<Detent, string> = { peek: 'collapsed', medium: 'half height', large: 'full height' };

function useViewport() {
  const read = () => {
    const viewport = window.visualViewport;
    return { height: viewport?.height ?? window.innerHeight, bottom: viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0 };
  };
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => setViewport(read());
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, []);
  return viewport;
}

function readSafeArea(name: '--safe-top' | '--safe-bottom'): number {
  if (typeof window === 'undefined') return 0;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : 0;
}

/**
 * Mobile bottom sheet with three detents. Drag the handle or header (velocity-aware snapping),
 * tap the handle to step up, or use the keyboard: Arrow Up / Arrow Down resize, Enter toggles.
 * Hidden content is `inert`, so focus never lands on controls that are off-screen.
 */
export function BottomSheet({
  label,
  detent,
  onDetentChange,
  onHeightChange,
  header,
  children,
}: {
  label: string;
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  /** Settled visible height in px (for map padding and attribution offset). */
  onHeightChange?: (px: number) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const { height: vh, bottom } = useViewport();
  const contentId = useId();
  const handleRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(96);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ id: number; startY: number; startH: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const safeTop = readSafeArea('--safe-top');
  const safeBottom = readSafeArea('--safe-bottom');
  const large = Math.max(headerH + safeBottom, vh - safeTop - 64);
  const peek = Math.min(large, headerH + safeBottom);
  const heights: Record<Detent, number> = {
    peek,
    medium: Math.min(large, Math.max(peek, Math.min(Math.max(headerH + 180, Math.round(vh * 0.52)), vh - safeTop - 120))),
    large,
  };
  const settled = heights[detent];
  const current = dragH ?? settled;

  useEffect(() => {
    onHeightChange?.(settled + bottom);
  }, [settled, bottom, onHeightChange]);

  useLayoutEffect(() => {
    if (detent === 'peek' && contentRef.current?.contains(document.activeElement)) handleRef.current?.focus();
  }, [detent]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const i = ORDER.indexOf(detent);
      const next = ORDER[Math.max(0, Math.min(ORDER.length - 1, i + dir))]!;
      if (next !== detent) onDetentChange(next);
    },
    [detent, onDetentChange],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    suppressClick.current = false;
    const target = e.target as HTMLElement;
    // Let buttons and fields inside the header work normally; the handle itself is draggable.
    if (target.closest('button, select, input, a, label') && !target.closest('[data-sheet-handle]')) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startH: current, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
    // Capture on the handle itself so an unmoved pointer still dispatches its native click.
    const captureTarget = target.closest<HTMLElement>('[data-sheet-handle]') ?? e.currentTarget;
    captureTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    if (Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(heights.peek, Math.min(heights.large, d.startH - (e.clientY - d.startY))));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      setDragH(null);
      return; // a tap; the handle's click handler takes it from here
    }
    // Browsers dispatch click after a completed drag; it must not resize the sheet a second time.
    suppressClick.current = true;
    const h = d.startH - (e.clientY - d.startY);
    let target: Detent;
    if (Math.abs(d.v) > 0.45) {
      // Flick: move one detent in the flick direction from the nearest lower/upper detent.
      const up = d.v < 0;
      const candidates = ORDER.filter((k) => (up ? heights[k] > h : heights[k] < h));
      target = candidates.length ? (up ? candidates[0]! : candidates[candidates.length - 1]!) : up ? 'large' : 'peek';
    } else {
      target = ORDER.reduce((best, k) => (Math.abs(heights[k] - h) < Math.abs(heights[best] - h) ? k : best), detent);
    }
    setDragH(null);
    onDetentChange(target);
  };

  return (
    <section
      aria-label={label}
      className="glass-strong fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[28px] border-b-0"
      style={{
        bottom,
        height: heights.large,
        transform: `translateY(${heights.large - current}px)`,
        transition: dragH === null ? 'transform 380ms var(--ease-out)' : 'none',
        willChange: 'transform',
      }}
      data-detent={detent}
      data-testid="bottom-sheet"
    >
      <div
        ref={headerRef}
        className="shrink-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          suppressClick.current = true;
          setDragH(null);
        }}
      >
        <button
          type="button"
          ref={handleRef}
          data-sheet-handle
          aria-expanded={detent !== 'peek'}
          aria-controls={contentId}
          aria-label={`Panel ${DETENT_LABEL[detent]}. Press to ${detent === 'large' ? 'make smaller' : 'expand'}; use arrow keys to resize.`}
          onClick={(e) => {
            if (suppressClick.current && e.detail !== 0) {
              suppressClick.current = false;
              return;
            }
            if (detent === 'large') onDetentChange('medium');
            else step(1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              step(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              step(-1);
            }
          }}
          className="flex h-11 w-full cursor-grab items-center justify-center rounded-t-[28px] active:cursor-grabbing"
        >
          <span className="h-[5px] w-10 rounded-full bg-[#b9bed3]" aria-hidden="true" />
        </button>
        <div className="px-4 pb-3">{header}</div>
      </div>
      <div
        id={contentId}
        ref={contentRef}
        className="scroll-y min-h-0 shrink-0 grow-0 px-4"
        style={{ paddingBottom: `calc(${safeBottom}px + 24px)`, height: Math.max(0, current - headerH) }}
        inert={detent === 'peek' && dragH === null}
      >
        {children}
      </div>
    </section>
  );
}
