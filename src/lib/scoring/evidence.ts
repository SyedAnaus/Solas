import { slicePolyline } from '../graph/geo';
import type { RoutePiece } from '../graph/search';
import { LIGHTING_CLASSES, type LightingClass, type LngLat, type PedestrianGraph } from '../graph/types';

/** One stretch of a route with a single lighting class, its real geometry and its provenance. */
export interface EvidenceStretch {
  cls: LightingClass;
  coords: LngLat[];
  metres: number;
  segment: number;
  /** OSM way ids of the segment (provenance for mapped_lit / mapped_unlit). */
  ways: number[];
  /** The `lit` tag value on the way, if any. */
  litTag?: string;
  /** OSM street-lamp node ids (provenance for likely_lit). */
  lamps?: number[];
}

/** Split a route into lighting stretches in walking order, following the actual geometry. */
export function routeEvidence(graph: PedestrianGraph, pieces: RoutePiece[]): EvidenceStretch[] {
  const out: EvidenceStretch[] = [];
  for (const piece of pieces) {
    const seg = graph.segments[piece.segment]!;
    const lo = Math.min(piece.fromFrac, piece.toFrac);
    const hi = Math.max(piece.fromFrac, piece.toFrac);
    const intervals = piece.reversed ? [...seg.light].reverse() : seg.light;
    const lit = seg.tags.lit;
    for (const interval of intervals) {
      const a = Math.max(lo, interval.from);
      const b = Math.min(hi, interval.to);
      if (b - a <= 1e-9) continue;
      const coords = piece.reversed
        ? slicePolyline(seg.coords, seg.cumulative, b, a)
        : slicePolyline(seg.coords, seg.cumulative, a, b);
      out.push({
        cls: interval.cls,
        coords,
        metres: (b - a) * seg.length,
        segment: seg.id,
        ways: seg.ways,
        ...(typeof lit === 'string' ? { litTag: lit } : {}),
        ...(interval.lamps ? { lamps: interval.lamps } : {}),
      });
    }
  }
  return out;
}

/** Join consecutive stretches of the same class so the map draws fewer, longer lines. */
export function mergeStretches(stretches: EvidenceStretch[]): { cls: LightingClass; coords: LngLat[]; metres: number }[] {
  const merged: { cls: LightingClass; coords: LngLat[]; metres: number }[] = [];
  for (const s of stretches) {
    const last = merged[merged.length - 1];
    if (last && last.cls === s.cls) {
      last.coords.push(...s.coords.slice(1));
      last.metres += s.metres;
    } else {
      merged.push({ cls: s.cls, coords: [...s.coords], metres: s.metres });
    }
  }
  return merged;
}

export interface ClassProvenance {
  metres: number;
  ways: number[];
  lamps: number[];
  litTagValues: Record<string, number>;
}

/** Per class: how many metres, and which OSM ways / lamps the evidence comes from. */
export function summariseProvenance(stretches: EvidenceStretch[]): Record<LightingClass, ClassProvenance> {
  const acc = {} as Record<LightingClass, { metres: number; ways: Set<number>; lamps: Set<number>; tags: Record<string, number> }>;
  for (const cls of LIGHTING_CLASSES) acc[cls] = { metres: 0, ways: new Set(), lamps: new Set(), tags: {} };
  for (const s of stretches) {
    const a = acc[s.cls];
    a.metres += s.metres;
    if (s.cls === 'mapped_lit' || s.cls === 'mapped_unlit') {
      for (const w of s.ways) a.ways.add(w);
      if (s.litTag) a.tags[`lit=${s.litTag}`] = (a.tags[`lit=${s.litTag}`] ?? 0) + s.metres;
    }
    if (s.lamps) for (const l of s.lamps) a.lamps.add(l);
  }
  const out = {} as Record<LightingClass, ClassProvenance>;
  for (const cls of LIGHTING_CLASSES) {
    const a = acc[cls];
    out[cls] = {
      metres: a.metres,
      ways: [...a.ways].sort((x, y) => x - y),
      lamps: [...a.lamps].sort((x, y) => x - y),
      litTagValues: a.tags,
    };
  }
  return out;
}
