import { ROUTING_CONFIG } from '../../config/routing';
import type { RouteMetrics } from '../scoring/metrics';
import type { AccessibilitySummary } from '../scoring/accessibility';

/** Rounded headline share (mapped or likely lit) that matches the numbers shown in the legend. */
export function headlineLitPct(metrics: RouteMetrics): number {
  return metrics.lighting.roundedPercent.mapped_lit + metrics.lighting.roundedPercent.likely_lit;
}

export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}

export function extraTimeText(extraS: number): string {
  if (extraS < 30) return 'about the same time';
  return `+${minutesText(extraS)}`;
}

export function fastestRationale(metrics: RouteMetrics): string {
  return `Quickest walk on the mapped network. ${headlineLitPct(metrics)}% of it is mapped or likely lit.`;
}

export function betterLitRationale(fastest: RouteMetrics, candidate: RouteMetrics, extraS: number): string {
  const before = headlineLitPct(fastest);
  const after = headlineLitPct(candidate);
  const parts = [`${extraTimeText(extraS)} for more lighting evidence: ${before}% → ${after}% mapped or likely lit.`];
  const unknownSaved = fastest.lighting.metres.unknown - candidate.lighting.metres.unknown;
  const unlitSaved = fastest.lighting.metres.mapped_unlit - candidate.lighting.metres.mapped_unlit;
  if (unlitSaved >= 10) parts.push(`Avoids ${Math.round(unlitSaved)} m mapped as unlit.`);
  else if (unknownSaved >= 50) parts.push(`${Math.round(unknownSaved)} m less with no lighting data.`);
  return parts.join(' ');
}

/** Short, factual warnings about lighting coverage on one route. */
export function lightingWarnings(metrics: RouteMetrics): string[] {
  const cfg = ROUTING_CONFIG.lighting;
  const p = metrics.lighting.exactPercent;
  const r = metrics.lighting.roundedPercent;
  const out: string[] = [];
  if (p.unknown >= cfg.unknownWarningPct) {
    out.push(`${r.unknown}% of this route has no lighting information. Unknown is not the same as dark, but it cannot be confirmed lit.`);
  }
  if (metrics.lighting.metres.mapped_unlit >= 1) {
    out.push(`${Math.round(metrics.lighting.metres.mapped_unlit)} m is mapped as unlit.`);
  }
  if (p.likely_lit >= 25) {
    out.push(`${r.likely_lit}% is only likely lit: it is near mapped street lamps, which may be off or may not light the footway.`);
  }
  return out;
}

function flights(n: number): string {
  return `${n} set${n === 1 ? '' : 's'} of mapped steps`;
}

export function easierRationale(fastest: AccessibilitySummary, easier: AccessibilitySummary, extraS: number): string {
  const parts: string[] = [];
  const stepsAvoided = fastest.steps.flights - easier.steps.flights;
  if (stepsAvoided > 0) parts.push(`avoids ${flights(stepsAvoided)}`);
  const reduction = Math.round(fastest.difficultM - easier.difficultM);
  if (reduction >= 1) parts.push(`${reduction} m less on mapped steps, rough surfaces or steep tags`);
  return `${extraTimeText(extraS)}; ${parts.join(' and ') || 'fewer mapped difficulties'}. Gradient information unavailable.`;
}

export function stepFreeRationale(fastest: AccessibilitySummary, extraS: number): string {
  const avoided = fastest.steps.flights > 0 ? `Avoids the ${flights(fastest.steps.flights)} on the fastest route` : 'Avoids mapped barriers on the fastest route';
  return `${avoided} (${extraTimeText(extraS)}).`;
}
