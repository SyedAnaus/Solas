import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: 'glass' | 'plain' | 'filled';
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  /** Hide the visual tooltip (e.g. when the label is already visible nearby). */
  noTooltip?: boolean;
}

const VARIANT = {
  glass: 'glass text-ink hover:bg-white',
  plain: 'bg-transparent text-ink-2 hover:bg-fill hover:text-ink',
  filled: 'bg-fill text-ink hover:bg-link-water',
} as const;

/** A 44×44 px touch target with a required accessible label and a hover/focus tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, className = '', variant = 'plain', tooltipSide = 'bottom', noTooltip = false, ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
  return noTooltip ? button : <Tooltip content={label} side={tooltipSide}>{button}</Tooltip>;
});
