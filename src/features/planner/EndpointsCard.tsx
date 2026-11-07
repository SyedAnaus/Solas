import { ArrowUpDown, ChevronDown, Loader2 } from 'lucide-react';
import { useId } from 'react';
import { IconButton } from '../../components/IconButton';
import type { Landmark } from '../../lib/graph/types';
import { landmarkEndpoint, type Endpoint, type EndpointRole } from './endpoints';

const PICK = '__pick';
const LOCATE = '__locate';
const CURRENT = '__current';

interface RowProps {
  role: EndpointRole;
  endpoint: Endpoint | null;
  landmarks: Landmark[];
  disabled: boolean;
  picking: boolean;
  locating?: boolean;
  hasError: boolean;
  errorId: string;
  onChange: (endpoint: Endpoint | null) => void;
  onPick: () => void;
  onLocate?: () => void;
}

function EndpointRow({ role, endpoint, landmarks, disabled, picking, locating, hasError, errorId, onChange, onPick, onLocate }: RowProps) {
  const id = useId();
  const name = role === 'origin' ? 'Start' : 'Destination';
  const value = endpoint ? (endpoint.kind === 'landmark' ? endpoint.landmarkId : CURRENT) : '';
  return (
    <div className="flex items-center gap-3 pl-3 pr-1">
      {role === 'origin' ? (
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border-[2.5px] border-slate bg-white text-[11px] font-extrabold text-slate">
          A
        </span>
      ) : (
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-slate text-[11px] font-extrabold text-white">
          B
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <label htmlFor={id} className="pointer-events-none absolute left-0 top-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          {name}
          {picking && <span aria-hidden="true" className="ml-1 normal-case tracking-normal text-slate">· tap the map</span>}
        </label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          aria-busy={locating || undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v === PICK) return onPick();
            if (v === LOCATE) return onLocate?.();
            if (v === '') return onChange(null);
            if (v === CURRENT) return;
            const lm = landmarks.find((l) => l.id === v);
            if (lm) onChange(landmarkEndpoint(lm));
          }}
          className="-ml-px h-14 w-full cursor-pointer appearance-none truncate bg-transparent pb-1.5 pr-6 pt-[22px] text-[16px] font-medium text-ink outline-none disabled:cursor-wait disabled:text-ink-3"
        >
          <option value="">{disabled ? 'Loading places…' : role === 'origin' ? 'Choose a start' : 'Choose a destination'}</option>
          {endpoint && endpoint.kind !== 'landmark' && <option value={CURRENT}>{endpoint.kind === 'location' ? 'My location' : 'Point on map'}</option>}
          <option value={PICK}>Choose on map…</option>
          {onLocate && <option value={LOCATE} disabled={locating}>{locating ? 'Finding your location…' : 'Use my current location…'}</option>}
          <optgroup label="Places (OpenStreetMap)">
            {landmarks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </optgroup>
        </select>
        {locating ? (
          <Loader2 className="pointer-events-none absolute bottom-[11px] right-1 size-4 animate-spin text-ink-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="pointer-events-none absolute bottom-[11px] right-1 size-4 text-ink-3" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/** Start and destination, grouped like a directions card, with a swap button. */
export function EndpointsCard({
  origin,
  destination,
  landmarks,
  disabled,
  pickTarget,
  locating,
  errors,
  onChange,
  onPick,
  onLocate,
  onSwap,
}: {
  origin: Endpoint | null;
  destination: Endpoint | null;
  landmarks: Landmark[];
  disabled: boolean;
  pickTarget: EndpointRole | null;
  locating: boolean;
  errors: { origin: string | null; destination: string | null };
  onChange: (role: EndpointRole, e: Endpoint | null) => void;
  onPick: (role: EndpointRole) => void;
  onLocate: () => void;
  onSwap: () => void;
}) {
  const errorBase = useId();
  return (
    <div>
      <form
        aria-label="Choose start and destination"
        onSubmit={(e) => e.preventDefault()}
        className="flex items-center rounded-2xl border border-line bg-surface shadow-card"
      >
        <div className="min-w-0 flex-1 divide-y divide-line">
          <EndpointRow
            role="origin"
            endpoint={origin}
            landmarks={landmarks}
            disabled={disabled}
            picking={pickTarget === 'origin'}
            locating={locating}
            hasError={Boolean(errors.origin)}
            errorId={`${errorBase}-origin`}
            onChange={(e) => onChange('origin', e)}
            onPick={() => onPick('origin')}
            onLocate={onLocate}
          />
          <EndpointRow
            role="destination"
            endpoint={destination}
            landmarks={landmarks}
            disabled={disabled}
            picking={pickTarget === 'destination'}
            hasError={Boolean(errors.destination)}
            errorId={`${errorBase}-destination`}
            onChange={(e) => onChange('destination', e)}
            onPick={() => onPick('destination')}
          />
        </div>
        <div className="px-1">
          <IconButton label="Swap start and destination" disabled={!origin && !destination} onClick={onSwap} tooltipSide="left">
            <ArrowUpDown className="size-5" aria-hidden="true" />
          </IconButton>
        </div>
      </form>
      {(['origin', 'destination'] as const).map((role) =>
        errors[role] ? (
          <p key={role} id={`${errorBase}-${role}`} role="alert" className="mt-2 px-1 text-[13px] leading-snug text-danger">
            <span className="font-semibold">{role === 'origin' ? 'Start' : 'Destination'}:</span> {errors[role]}
          </p>
        ) : null,
      )}
    </div>
  );
}
