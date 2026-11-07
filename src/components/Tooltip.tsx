import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Hoverable, dismissible tooltip, kept inside the viewport and outside clipping panels.
 * When `describe` is true the text is also linked to the trigger as its description.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  describe = false,
}: {
  content: string;
  children: ReactElement<Record<string, unknown>>;
  side?: Side;
  describe?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  // A native dialog is in the top layer: its tooltip must remain inside that layer.
  const [container, setContainer] = useState<HTMLElement>(document.body);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay: number) => {
    cancelTimer();
    setContainer(triggerRef.current?.closest('dialog') ?? document.body);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    cancelTimer();
    setOpen(false);
  };
  const leave = () => {
    cancelTimer();
    // Allow moving the pointer over the gap to the tooltip itself.
    timer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      setOpen(false);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || tooltipRef.current?.contains(event.target)) return;
      if (timer.current) clearTimeout(timer.current);
      setOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const tip = tooltipRef.current.getBoundingClientRect();
      const dialog = container instanceof HTMLDialogElement ? container.getBoundingClientRect() : null;
      const bounds = dialog ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const gap = 8;
      let left = trigger.left + (trigger.width - tip.width) / 2;
      let top = trigger.bottom + gap;
      if (side === 'top') top = trigger.top - tip.height - gap;
      if (side === 'left' || side === 'right') {
        left = side === 'left' ? trigger.left - tip.width - gap : trigger.right + gap;
        top = trigger.top + (trigger.height - tip.height) / 2;
      }
      if (top + tip.height > bounds.bottom - gap) top = trigger.top - tip.height - gap;
      if (top < bounds.top + gap) top = trigger.bottom + gap;
      left = Math.max(bounds.left + gap, Math.min(left, bounds.right - tip.width - gap));
      top = Math.max(bounds.top + gap, Math.min(top, bounds.bottom - tip.height - gap));
      setPosition({ position: dialog ? 'absolute' : 'fixed', left: left - (dialog?.left ?? 0), top: top - (dialog?.top ?? 0), visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, side, content, container]);

  const description = [children.props['aria-describedby'], id].filter(Boolean).join(' ');
  const trigger = cloneElement(children, describe ? { 'aria-describedby': description, 'aria-controls': id, 'aria-expanded': open } : {});
  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(350)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && leave()}
      onFocus={(e) => (e.target as HTMLElement).matches(':focus-visible') && show(0)}
      onBlur={hide}
      onClick={(event) => {
        if (!describe || tooltipRef.current?.contains(event.target as Node)) return;
        if (open) hide();
        else show(0);
      }}
    >
      {trigger}
      {createPortal(<span
        ref={tooltipRef}
        role="tooltip"
        id={id}
        hidden={!open}
        style={position}
        onPointerEnter={cancelTimer}
        onPointerLeave={(event) => event.pointerType === 'mouse' && leave()}
        className="z-50 w-max max-w-[min(240px,calc(100vw-32px))] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg"
      >
        {content}
      </span>, container)}
    </span>
  );
}
