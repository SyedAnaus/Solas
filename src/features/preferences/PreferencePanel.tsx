import { useState } from 'react';
import { Accessibility, ChevronDown, Footprints, Lightbulb, SlidersHorizontal, Timer } from 'lucide-react';
import { ROUTING_CONFIG, type LightingEmphasis } from '../../config/routing';
import { Segmented } from '../../components/Segmented';
import { Switch } from '../../components/Switch';
import type { RouteMode, RoutePreferences } from '../../lib/routing/preferences';

const ICON = 'size-4';

export function ModeSelector({ prefs, onChange, availableModes }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void; availableModes: RouteMode[] }) {
  const unavailable = 'Not available in this build.';
  return (
    <Segmented<RouteMode>
      legend="Route preference"
      value={prefs.mode}
      onChange={(mode) => onChange({ ...prefs, mode })}
      options={[
        { value: 'fastest', label: 'Fastest', icon: <Timer className={ICON} aria-hidden="true" />, description: 'Shortest estimated walking time.' },
        {
          value: 'better_lit',
          label: 'Better lit',
          icon: <Lightbulb className={ICON} aria-hidden="true" />,
          description: 'Prefers streets mapped as lit or near mapped street lamps, within your time limit.',
        },
        {
          value: 'easier',
          label: 'Easier',
          icon: <Footprints className={ICON} aria-hidden="true" />,
          disabled: !availableModes.includes('easier'),
          description: availableModes.includes('easier') ? 'Prefers fewer mapped steps, rough surfaces and steep incline tags.' : unavailable,
        },
        {
          value: 'step_free',
          label: 'Step-free',
          icon: <Accessibility className={ICON} aria-hidden="true" />,
          disabled: !availableModes.includes('step_free'),
          description: availableModes.includes('step_free') ? 'Never uses mapped steps, mapped barriers or paths tagged wheelchair=no.' : unavailable,
        },
      ]}
    />
  );
}

function summary(prefs: RoutePreferences): string {
  const parts = [`max +${prefs.maxDetourMin} min`];
  if (prefs.avoidSteps) parts.push('no steps');
  if (prefs.preferSmoothSurfaces) parts.push('smooth surfaces');
  if (prefs.showLongerAlternatives) parts.push('longer shown');
  return parts.join(', ');
}

export function FineTune({ prefs, onChange }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void }) {
  const [open, setOpen] = useState(false);
  const panelId = 'fine-tune-panel';
  const lightingRelevant = prefs.mode === 'fastest' || prefs.mode === 'better_lit';
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
        <span className="ml-1 truncate text-xs font-medium text-ink-subtle">{summary(prefs)}</span>
        <ChevronDown className={`ml-auto size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
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
            description="Also show one alternative beyond your limit, clearly marked as longer."
            checked={prefs.showLongerAlternatives}
            onChange={(showLongerAlternatives) => onChange({ ...prefs, showLongerAlternatives })}
          />
          <Switch
            label="Avoid steps"
            description="Never use mapped steps in any route, including the fastest. Unmapped steps cannot be avoided."
            checked={prefs.avoidSteps}
            onChange={(avoidSteps) => onChange({ ...prefs, avoidSteps })}
          />
          <Switch
            label="Prefer smoother surfaces"
            description={
              prefs.mode === 'easier'
                ? 'Always on in Easier mode.'
                : 'Uses mapped surface and smoothness tags in better-lit and step-free searches. Unmapped surfaces are treated as unknown, not rough.'
            }
            checked={prefs.mode === 'easier' ? true : prefs.preferSmoothSurfaces}
            disabled={prefs.mode === 'easier'}
            onChange={(preferSmoothSurfaces) => onChange({ ...prefs, preferSmoothSurfaces })}
          />
          <Switch
            label="Prefer gentler slopes"
            description="Unavailable: gradient information is unavailable because Solas has no trustworthy elevation data. Easier mode uses OSM incline tags where they exist."
            checked={false}
            disabled
            onChange={() => {}}
          />
          <div className={lightingRelevant ? '' : 'opacity-60'}>
            <Segmented<LightingEmphasis>
              legend="Lighting emphasis"
              size="sm"
              value={prefs.lightingEmphasis}
              onChange={(lightingEmphasis) => onChange({ ...prefs, lightingEmphasis })}
              options={[
                { value: 'gentle', label: 'Gentle', disabled: !lightingRelevant, description: 'Small penalties: mainly avoids streets mapped as unlit.' },
                { value: 'balanced', label: 'Balanced', disabled: !lightingRelevant, description: 'Moderate penalties for unlit and unknown lighting.' },
                { value: 'strong', label: 'Strong', disabled: !lightingRelevant, description: 'Strongly prefers streets mapped as lit.' },
              ]}
            />
            {!lightingRelevant && <p className="mt-1 text-xs text-ink-subtle">Used by the Fastest and Better lit preferences.</p>}
          </div>
          <p className="text-xs leading-snug text-ink-subtle">
            A better-lit option is offered only if it has at least {ROUTING_CONFIG.lighting.minImprovementPts} percentage points more
            mapped-or-likely-lit walking than the fastest route. Thresholds are starting heuristics, not safety standards.
          </p>
        </div>
      )}
    </div>
  );
}
