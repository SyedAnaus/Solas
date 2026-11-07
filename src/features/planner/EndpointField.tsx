import { Crosshair, LocateFixed, Loader2, X } from 'lucide-react';
import { useId } from 'react';
import { IconButton } from '../../components/IconButton';
import type { Landmark } from '../../lib/graph/types';
import { landmarkEndpoint, type Endpoint, type EndpointRole } from './endpoints';

const CUSTOM = '__custom';

interface EndpointFieldProps {
  role: EndpointRole;
  endpoint: Endpoint | null;
  landmarks: Landmark[];
  disabled: boolean;
  picking: boolean;
  locating?: boolean;
  error?: string | null;
  onChange: (endpoint: Endpoint | null) => void;
  onTogglePick: () => void;
  onUseLocation?: () => void;
}

export function EndpointField({
  role,
  endpoint,
  landmarks,
  disabled,
  picking,
  locating,
  error,
  onChange,
  onTogglePick,
  onUseLocation,
}: EndpointFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const name = role === 'origin' ? 'Start' : 'Destination';
  const value = endpoint ? (endpoint.kind === 'landmark' ? endpoint.landmarkId : CUSTOM) : '';

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {name}
      </label>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
            role === 'origin' ? 'bg-ink text-bg' : 'bg-accent text-accent-contrast'
          }`}
        >
          {role === 'origin' ? 'A' : 'B'}
        </span>
        <div className="relative min-w-0 flex-1">
          <select
            id={id}
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || v === CUSTOM) {
                if (v === '') onChange(null);
                return;
              }
              const lm = landmarks.find((l) => l.id === v);
              if (lm) onChange(landmarkEndpoint(lm));
            }}
            className="h-11 w-full appearance-none truncate rounded-xl border border-line bg-surface px-3 pr-9 text-[15px] font-medium text-ink outline-none transition-colors hover:border-line-strong focus-visible:border-accent disabled:opacity-60"
          >
            <option value="">{disabled ? 'Loading places…' : role === 'origin' ? 'Choose a start…' : 'Choose a destination…'}</option>
            {endpoint && endpoint.kind !== 'landmark' && <option value={CUSTOM}>{endpoint.kind === 'location' ? 'My location' : 'Point on map'}</option>}
            <optgroup label="Verified places (OpenStreetMap)">
              {landmarks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          </select>
          {endpoint && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Clear ${name.toLowerCase()}`}
              className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <IconButton
          label={picking ? `Stop choosing ${name.toLowerCase()} on map` : `Choose ${name.toLowerCase()} on the map`}
          aria-pressed={picking}
          disabled={disabled}
          onClick={onTogglePick}
          className={picking ? '!border-accent !bg-accent !text-accent-contrast' : ''}
        >
          <Crosshair className="size-5" aria-hidden="true" />
        </IconButton>
        {onUseLocation && (
          <IconButton label="Use my current location (asks permission)" disabled={disabled || locating} onClick={onUseLocation}>
            {locating ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <LocateFixed className="size-5" aria-hidden="true" />}
          </IconButton>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
