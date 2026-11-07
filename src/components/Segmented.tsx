import { useId, type ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Read to screen readers and shown as a tooltip, e.g. why an option is disabled. */
  description?: string;
}

/**
 * iOS-style segmented control built on native radios: arrow keys move between options and screen
 * readers announce "radio, 2 of 4". The selected option is a raised white thumb.
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
      <legend className={hideLegend ? 'sr-only' : 'mb-1.5 text-[13px] font-semibold text-ink-2'}>{legend}</legend>
      <div
        className="grid gap-0.5 rounded-[14px] bg-fill p-[3px]"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
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
                className={`pressable flex cursor-pointer select-none flex-col items-center justify-center gap-0.5 rounded-[11px] px-1 text-center font-semibold leading-tight peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--focus)] peer-disabled:cursor-not-allowed peer-disabled:opacity-40 ${
                  size === 'sm' ? 'min-h-11 text-[12.5px]' : 'min-h-[52px] text-[12px]'
                } ${checked ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(31_35_80/0.18),0_0_0_0.5px_rgb(31_35_80/0.06)]' : 'text-ink-2 hover:text-ink'}`}
              >
                {o.icon}
                <span className="max-w-full truncate">{o.label}</span>
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
