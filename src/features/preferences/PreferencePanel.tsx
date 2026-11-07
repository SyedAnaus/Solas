import { useId, useState } from 'react';
import { Accessibility, Footprints, Lightbulb, SlidersHorizontal, Timer } from 'lucide-react';
import { ROUTING_CONFIG, type LightingEmphasis } from '../../config/routing';
import { Segmented } from '../../components/Segmented';
import { Switch } from '../../components/Switch';
import { MODE_BENEFIT, type RouteMode, type RoutePreferences } from '../../lib/routing/preferences';

const ICON = 'size-[18px]';


function optionsSummary(prefs: RoutePreferences): string {
  const parts = [`up to +${prefs.maxDetourMin} min`];
  if (prefs.avoidSteps) parts.push('no steps');
  if (prefs.preferSmoothSurfaces) parts.push('smooth');
  return parts.join(' · ');
}

export function ModeSelector({ prefs, onChange }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-2">
      <Segmented<RouteMode>
        legend="Route preference"
        hideLegend
        value={prefs.mode}
        onChange={(mode) => onChange({ ...prefs, mode })}
        options={[
          { value: 'fastest', label: 'Fastest', icon: <Timer className={ICON} aria-hidden="true" />, description: MODE_BENEFIT.fastest },
          { value: 'better_lit', label: 'Better lit', icon: <Lightbulb className={ICON} aria-hidden="true" />, description: MODE_BENEFIT.better_lit },
          { value: 'easier', label: 'Easier', icon: <Footprints className={ICON} aria-hidden="true" />, description: MODE_BENEFIT.easier },
          { value: 'step_free', label: 'Step-free', icon: <Accessibility className={ICON} aria-hidden="true" />, description: MODE_BENEFIT.step_free },
        ]}
      />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 px-1 text-[13px] leading-snug text-ink-2" aria-live="polite">
          {MODE_BENEFIT[prefs.mode]}
        </p>
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls={panelId}
          onClick={() => setOptionsOpen((o) => !o)}
          className={`pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${
            optionsOpen ? 'bg-ink text-white' : 'bg-fill text-ink hover:bg-link-water'
          }`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Options
          <span className="sr-only">: {optionsSummary(prefs)}</span>
        </button>
      </div>
      {optionsOpen && (
        <div id={panelId} className="enter">
          <OptionsPanel prefs={prefs} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

export function OptionsPanel({ prefs, onChange }: { prefs: RoutePreferences; onChange: (p: RoutePreferences) => void }) {
  const lightingRelevant = prefs.mode === 'fastest' || prefs.mode === 'better_lit';
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <Segmented<number>
        legend="Maximum extra time vs fastest"
        size="sm"
        value={prefs.maxDetourMin}
        onChange={(maxDetourMin) => onChange({ ...prefs, maxDetourMin })}
        options={ROUTING_CONFIG.detour.optionsMin.map((m) => ({ value: m, label: `${m} min` }))}
      />
      <div className="divide-y divide-line">
        <Switch
          label="Avoid steps"
          description="No mapped steps in any route, including the fastest."
          checked={prefs.avoidSteps}
          onChange={(avoidSteps) => onChange({ ...prefs, avoidSteps })}
        />
        <Switch
          label="Prefer smoother surfaces"
          description={prefs.mode === 'easier' ? 'Always on for Easier.' : 'Uses mapped surface tags. Unmapped is not treated as rough.'}
          checked={prefs.mode === 'easier' ? true : prefs.preferSmoothSurfaces}
          disabled={prefs.mode === 'easier'}
          onChange={(preferSmoothSurfaces) => onChange({ ...prefs, preferSmoothSurfaces })}
        />
        <Switch
          label="Show longer alternatives"
          description="Also show one option beyond your limit, clearly marked."
          checked={prefs.showLongerAlternatives}
          onChange={(showLongerAlternatives) => onChange({ ...prefs, showLongerAlternatives })}
        />
        <Switch
          label="Prefer gentler slopes"
          description="Unavailable: gradient information is unavailable without trustworthy elevation data."
          checked={false}
          disabled
          onChange={() => {}}
        />
      </div>
      {lightingRelevant && (
        <Segmented<LightingEmphasis>
          legend="Lighting emphasis"
          size="sm"
          value={prefs.lightingEmphasis}
          onChange={(lightingEmphasis) => onChange({ ...prefs, lightingEmphasis })}
          options={[
            { value: 'gentle', label: 'Gentle', description: 'Mainly avoids streets mapped as unlit.' },
            { value: 'balanced', label: 'Balanced', description: 'Avoids unlit and unknown lighting moderately.' },
            { value: 'strong', label: 'Strong', description: 'Strongly prefers streets mapped as lit.' },
          ]}
        />
      )}
      <p className="text-[12px] leading-snug text-ink-3">
        A better-lit route needs at least {ROUTING_CONFIG.lighting.minImprovementPts} points more mapped-or-likely-lit walking. These are
        starting heuristics, not safety standards.
      </p>
    </div>
  );
}
