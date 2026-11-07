import { useId } from 'react';

/** Accessible on/off switch with a visible label and optional explanation. */
export function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-xs leading-snug text-ink-subtle">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed ${
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-raised'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#121633] shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        >
          {checked ? 'on' : ''}
        </span>
      </button>
    </div>
  );
}
