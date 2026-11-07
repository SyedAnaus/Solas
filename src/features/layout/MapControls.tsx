import { Lightbulb, Scan } from 'lucide-react';
import { IconButton } from '../../components/IconButton';

/**
 * Floating map controls (top right). Every control is a 44 px glass button with a label, a
 * tooltip and, for toggles, aria-pressed.
 */
export function MapControls({
  evidenceOn,
  onToggleEvidence,
  canFit,
  onFit,
  top,
}: {
  evidenceOn: boolean;
  onToggleEvidence: () => void;
  canFit: boolean;
  onFit: () => void;
  top: string;
}) {
  return (
    <div className="pointer-events-none absolute right-3 z-10 flex flex-row gap-2 md:flex-col" style={{ top }}>
      <div className="pointer-events-auto">
        <IconButton
          variant="glass"
          label={evidenceOn ? 'Hide lighting evidence on the map' : 'Show lighting evidence on the map'}
          aria-pressed={evidenceOn}
          disabled={!canFit}
          tooltipSide="left"
          onClick={onToggleEvidence}
          className={evidenceOn ? '!bg-ev-tube !text-ev-lit' : ''}
        >
          <Lightbulb className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      <div className="pointer-events-auto">
        <IconButton variant="glass" label="Show the whole route" disabled={!canFit} tooltipSide="left" onClick={onFit}>
          <Scan className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
