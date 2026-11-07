import { useState } from 'react';
import { Accessibility, ChevronDown, Lightbulb, SlidersHorizontal, Timer, Footprints } from 'lucide-react';
import { ROUTING_CONFIG, type LightingEmphasis } from '../../config/routing';
import { Segmented } from '../../components/Segmented';
import { Switch } from '../../components/Switch';
import type { RouteMode, RoutePreferences } from '../../lib/routing/preferences';

const ICON = 'size-4';

export function ModeSelector({ prefs, onChange, availableModes }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void; availableModes: RouteMode[] }) {
  const unavailable = 'Coming in the next phase.';
  return (
    <Segmented<RouteMode>
      legend="Route preference"
      value={prefs.mode}
      onChange={(mode) => onChange({ ...prefs, mode })}
      options={[
        { value: 'fastest', label: 'Fastest', icon: <Timer className={ICON} aria-hidden="true" /> },
        { value: 'better_lit', label: 'Better lit', icon: <Lightbulb className={ICON} aria-hidden="true" /> },
        {
          value: 'easier',
          label: 'Easier',
          icon: <Footprints className={ICON} aria-hidden="true" />,
          disabled: !availableModes.includes('easier'),
          description: availableModes.includes('easier') ? 'Prefers mapped smooth surfaces and fewer steps.' : unavailable,
        },
        {
          value: 'step_free',
          label: 'Step-free',
          icon: <Accessibility className={ICON} aria-hidden="true" />,
          disabled: !availableModes.includes('step_free'),
          description: availableModes.includes('step_free') ? 'Never uses mapped steps or mapped barriers.' : unavailable,
        },
      ]}
    />
  );
}

export function FineTune({ prefs, onChange }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void }) {
  const [open, setOpen] = useState(false);
  const panelId = 'fine-tune-panel';
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold"
      >
        <SlidersHorizontal className="size-4 text-accent" aria-hidden="true" />
        Fine-tune
        <span className="ml-1 truncate text-xs font-medium text-ink-subtle">
          max +{prefs.maxDetourMin} min{prefs.showLongerAlternatives ? ', longer shown' : ''}
        </span>
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-line p-3">
          <Segmented<number>
            legend="Maximum extra time vs fastest"
            size="sm"
            value={prefs.maxDetourMin}
            onChange={(maxDetourMin) => onChange({ ...prefs, maxDetourMin })}
            options={ROUTING_CONFIG.detour.optionsMin.map((m) => ({ value: m, label: `${m} min` }))}
          />
          <Switch
            label="Show longer alternatives"
            description="Also show one better-lit route beyond your limit, clearly marked as longer."
            checked={prefs.showLongerAlternatives}
            onChange={(showLongerAlternatives) => onChange({ ...prefs, showLongerAlternatives })}
          />
          <Segmented<LightingEmphasis>
            legend="Lighting emphasis"
            size="sm"
            value={prefs.lightingEmphasis}
            onChange={(lightingEmphasis) => onChange({ ...prefs, lightingEmphasis })}
            options={[
              { value: 'gentle', label: 'Gentle', description: 'Small penalties: mainly avoids streets mapped as unlit.' },
              { value: 'balanced', label: 'Balanced', description: 'Moderate penalties for unlit and unknown lighting.' },
              { value: 'strong', label: 'Strong', description: 'Strongly prefers streets mapped as lit.' },
            ]}
          />
          <p className="text-xs leading-snug text-ink-subtle">
            A better-lit option is offered only if it has at least {ROUTING_CONFIG.lighting.minImprovementPts} percentage points more
            mapped-or-likely-lit walking than the fastest route. These thresholds are starting heuristics, not safety standards.
          </p>
        </div>
      )}
    </div>
  );
}
