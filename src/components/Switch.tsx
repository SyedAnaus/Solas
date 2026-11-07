import { useId } from 'react';

/** iOS-style switch with a visible label and optional explanation. The whole row is clickable. */
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={id}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg py-1 text-left disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="min-w-0 flex-1">
        <span id={id} className="block text-[15px] font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-slate' : 'bg-[#cfd3e3]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(31_35_80/0.25)] transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </span>
    </button>
  );
}
