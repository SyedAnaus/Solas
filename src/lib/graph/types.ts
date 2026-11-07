/** Shared types for the Solas walking graph. Coordinates are always [longitude, latitude]. */

export type LngLat = [number, number];

export const LIGHTING_CLASSES = ['mapped_lit', 'likely_lit', 'mapped_unlit', 'unknown'] as const;
export type LightingClass = (typeof LIGHTING_CLASSES)[number];

/** A stretch of a segment, as fractions 0..1 of its length from `u` to `v`, with one lighting class. */
export interface LightingInterval {
  from: number;
  to: number;
  cls: LightingClass;
  /** For likely_lit: OSM ids of the street lamps within range of this stretch (its provenance). */
  lamps?: number[];
}

/** Where a piece of evidence came from. */
export interface EvidenceSource {
  name: string;
  licence: string;
  url: string;
  attribution: string;
  via?: string;
}

export interface CoverageArea {
  type: 'Polygon';
  coordinates: LngLat[][];
  bbox: [number, number, number, number];
  method: string;
  areaKm2: number;
}

export interface DatasetCounts {
  nodes: number;
  segments: number;
  directedEdges: number;
  totalLengthM: number;
  lampsMapped: number;
  lampsNearNetwork: number;
  stepsSegments: number;
  landmarks: number;
}

export interface DatasetMeta {
  schemaVersion: number;
  synthetic: boolean;
  areaId: string;
  areaName: string;
  generatedAt: string;
  osmDataTimestamps: string[];
  coverage: CoverageArea;
  counts: DatasetCounts;
  lightingMetres: Record<LightingClass, number>;
  accessibilityTagMetres?: Record<string, number>;
  parameters?: Record<string, unknown>;
  sources: EvidenceSource[];
  licence: string;
  [key: string]: unknown;
}

export interface Landmark {
  id: string;
  label: string;
  category: string;
  osm: string;
  osmName?: string | null;
  labelPoint: LngLat;
  routingPoint: LngLat;
  routingPointDistanceM: number;
  routingEdgeId?: number;
}

export interface DatasetManifest {
  schema: 'solas-manifest';
  schemaVersion: number;
  synthetic: boolean;
  areaId: string;
  areaName: string;
  generatedAt: string;
  osmDataTimestamps: string[];
  coverage: CoverageArea;
  counts: DatasetCounts;
  lightingMetres: Record<LightingClass, number>;
  licence: string;
  /** Data-preparation parameters, e.g. lampRadiusMetres. */
  parameters?: { lampRadiusMetres?: number; [key: string]: unknown };
  /** Machine-readable rule, provenance and confidence for each lighting class. */
  lightingClasses?: Record<LightingClass, { rule: string; provenance: string; confidence: string }>;
  graph: { path: string; bytes: number; sha256: string };
  landmarks: Landmark[];
}

/* ---------------------------------------------------------------- file format (graph.json) */

export type TagValue = string | string[];

export interface GraphFileEdge {
  id: number;
  u: number;
  v: number;
  len: number;
  fwd: boolean;
  bwd: boolean;
  ways: number[];
  tags: Record<string, TagValue>;
  /** [from, to, class] or, for likely_lit, [from, to, 'likely_lit', lampIds]. */
  light: ([number, number, LightingClass] | [number, number, LightingClass, number[]])[];
  /** Flat [lon, lat, lon, lat, ...] from node u to node v. */
  g: number[];
}

export interface GraphFile {
  schema: 'solas-graph';
  meta: DatasetMeta;
  nodes: { coords: number[]; osmIds: number[]; tags: Record<string, Record<string, string>> };
  edges: GraphFileEdge[];
  lamps: { id: number; c: LngLat; tags?: Record<string, string> }[];
}

/* ---------------------------------------------------------------- in-memory graph */

export interface PedestrianNode {
  index: number;
  osmId: number;
  coord: LngLat;
  tags?: Record<string, string>;
}

/** A physical stretch of path between two nodes, stored once with its geometry. */
export interface Segment {
  id: number;
  u: number;
  v: number;
  /** Length in metres from the source data (geodesic). */
  length: number;
  coords: LngLat[];
  /** Cumulative geodesic distance along `coords`, normalised so the last value equals `length`. */
  cumulative: Float64Array;
  tags: Record<string, TagValue>;
  light: LightingInterval[];
  /** All lamps supporting likely_lit stretches on this segment. */
  lamps: number[];
  ways: number[];
  forwardAllowed: boolean;
  backwardAllowed: boolean;
}

/** A directed, traversable edge: a segment walked in one direction. */
export interface PedestrianEdge {
  /** segmentId * 2 for u→v, segmentId * 2 + 1 for v→u. */
  id: number;
  segment: number;
  from: number;
  to: number;
  reversed: boolean;
  length: number;
}

export interface PedestrianGraph {
  meta: DatasetMeta;
  nodes: PedestrianNode[];
  segments: Segment[];
  /** Indexed by directed edge id; entries for forbidden directions are null. */
  edges: (PedestrianEdge | null)[];
  /** CSR adjacency: outgoing directed edge ids of node n are adjEdges[adjStart[n] .. adjStart[n+1]). */
  adjStart: Int32Array;
  adjEdges: Int32Array;
  lamps: { id: number; coord: LngLat; tags?: Record<string, string> }[];
}
