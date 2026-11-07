import { useId, type ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Shown as a tooltip and to screen readers, e.g. why an option is disabled. */
  description?: string;
}

/**
 * Radio group styled as segmented buttons. Native radios give arrow-key navigation and correct
 * screen-reader semantics for free.
 */
export function Segmented<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  hideLegend = false,
  size = 'md',
}: {
  legend: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  hideLegend?: boolean;
  size?: 'sm' | 'md';
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={hideLegend ? 'sr-only' : 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle'}>{legend}</legend>
      <div className="grid gap-1 rounded-xl border border-line bg-surface p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = o.value === value;
          return (
            <div key={o.value} className="min-w-0">
              <input
                type="radio"
                id={id}
                name={name}
                value={String(o.value)}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
                aria-describedby={o.description ? `${id}-desc` : undefined}
              />
              <label
                htmlFor={id}
                title={o.description}
                className={`flex cursor-pointer select-none flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-center font-semibold leading-tight transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--focus)] peer-disabled:cursor-not-allowed peer-disabled:opacity-45 ${
                  size === 'sm' ? 'min-h-9 text-xs' : 'min-h-11 text-[12.5px]'
                } ${checked ? 'bg-accent text-accent-contrast shadow-sm' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}
              >
                {o.icon}
                <span className="truncate">{o.label}</span>
              </label>
              {o.description && (
                <span id={`${id}-desc`} className="sr-only">
                  {o.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
