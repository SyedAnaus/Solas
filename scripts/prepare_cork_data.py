#!/usr/bin/env python3
"""
Prepare the Solas walking dataset for a small area of Cork City from OpenStreetMap.

This is an OFFLINE, development-time tool. Its output is committed to public/data/ and served as
static files by GitHub Pages. Nothing in this script runs in the deployed app.

What it does
1. Fetches the configured landmarks (OSM elements by type/id) from Overpass. Two "anchor"
   landmarks define the study area: their bounding box, buffered by `bufferMetres`.
2. Downloads the OSM pedestrian network with OSMnx 2.x (walk filter, plus cycleways that
   explicitly allow pedestrians), drops ways whose access tags forbid walking, simplifies the
   graph while keeping attribute changes (lit, surface, steps...) as edge boundaries, and keeps
   the largest connected component.
3. Downloads mapped street lamps (highway=street_lamp) and classifies every metre of every edge:
     mapped_lit    explicit lit=yes (or equivalent) on the way
     mapped_unlit  explicit lit=no / lit=disused on the way
     likely_lit    no lit tag, but within `lamp.radiusMetres` of a mapped street lamp
     unknown       no usable evidence
   A lamp only affects the stretch of path within the radius, never a whole long edge.
4. Exports a compact browser graph, landmarks and a manifest with provenance, coverage and
   evidence statistics, plus a human-readable report.

Elevation is NOT derived. OSM `incline` tags are exported as-is; everything else is unknown.

Usage
  .venv/Scripts/python.exe scripts/prepare_cork_data.py            (Windows)
  .venv/bin/python scripts/prepare_cork_data.py                    (macOS/Linux)
Options: --config PATH  --out-dir PATH  --report PATH  --refresh (ignore the Overpass cache)

Data licence: OpenStreetMap data is (c) OpenStreetMap contributors, ODbL 1.0. The output files are
a derived database and are published under ODbL 1.0.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import platform
import shutil
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import networkx as nx
import numpy as np
import osmnx as ox
import requests
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, box, mapping

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "scripts" / "config" / "cork_corridor.json"
DEFAULT_OUT = ROOT / "public" / "data" / "cork"
DEFAULT_REPORT = ROOT / "docs" / "DATASET_REPORT.md"
CACHE_DIR = ROOT / "scripts" / ".cache"

SCHEMA_VERSION = 1
COORD_DP = 6  # ~0.1 m

# OSM way tags kept on edges. Only tags present on a way are exported.
WAY_TAGS = [
    "highway", "name", "access", "foot", "lit", "surface", "smoothness", "wheelchair",
    "incline", "sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right", "footway",
    "crossing", "crossing:markings", "kerb", "step_count", "ramp", "ramp:wheelchair",
    "handrail", "tactile_paving", "width", "est_width", "tunnel", "bridge", "covered",
    "indoor", "level", "service", "segregated", "bicycle", "oneway:foot",
]
# Attributes whose change should split an edge during simplification, so each exported edge has
# one value for each of them.
EDGE_ATTRS_DIFFER = [
    "highway", "lit", "surface", "smoothness", "wheelchair", "incline", "footway", "crossing",
    "sidewalk", "step_count", "ramp", "access", "foot", "tunnel", "bridge", "covered", "indoor",
    "handrail", "tactile_paving", "kerb",
]
# OSM node tags kept on graph nodes. Nodes carrying any of these stay as graph nodes.
NODE_TAGS = [
    "highway", "kerb", "kerb:height", "crossing", "crossing:markings", "tactile_paving",
    "barrier", "wheelchair", "entrance", "traffic_signals:sound", "button_operated",
]
NODE_ATTRS_INCLUDE = ["kerb", "kerb:height", "crossing", "tactile_paving", "barrier", "wheelchair"]

LIT_YES = {"yes", "24/7", "automatic", "sunset-sunrise", "dusk-dawn"}
LIT_NO = {"no", "disused"}

# Cycleways are excluded by OSMnx's walk filter. Include them only where foot access is explicit.
CYCLEWAY_FOOT_FILTER = (
    '["highway"="cycleway"]["foot"~"^(yes|designated|permissive)$"]'
    '["area"!~"yes"]["access"!~"private"]'
)
FOOT_ALLOWED = {"yes", "designated", "permissive"}
ACCESS_FORBIDDEN = {"no", "private"}

log = logging.getLogger("prepare_cork_data")


def shp_transform(fn, geom):
    """Apply a pyproj transformer's `transform` to a Shapely geometry (vectorised)."""
    return shapely.transform(geom, lambda xy: np.column_stack(fn(xy[:, 0], xy[:, 1])))



# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------

def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return False


def scalar(value: Any) -> Any:
    """Collapse OSMnx list attributes. Identical values collapse; differing values become a list."""
    if isinstance(value, (list, tuple, set)):
        vals = [v for v in value if not is_missing(v)]
        unique = sorted({str(v) for v in vals})
        if not unique:
            return None
        if len(unique) == 1:
            return unique[0]
        return unique
    if is_missing(value):
        return None
    return value


def as_list(value: Any) -> list[Any]:
    if isinstance(value, (list, tuple, set)):
        return [v for v in value if not is_missing(v)]
    if is_missing(value):
        return []
    return [value]


def round_coord(x: float) -> float:
    return round(float(x), COORD_DP)


def classify_lit(value: Any) -> tuple[str | None, str | None]:
    """Return (lighting class or None, note). Lists (mixed values) are treated as unknown."""
    if value is None:
        return None, None
    if isinstance(value, list):
        return None, f"mixed lit values {value}"
    v = str(value).strip().lower()
    if v in LIT_YES:
        return "mapped_lit", None
    if v in LIT_NO:
        return "mapped_unlit", None
    if v in {"limited", "interval"} or any(ch.isdigit() for ch in v):
        # Lit for part of the night only. Still explicit lighting evidence, but flagged.
        return "mapped_lit", f"lit={v} (part-night)"
    return None, f"unrecognised lit={v}"


RETRYABLE = (requests.RequestException, ox._errors.ResponseStatusCodeError)


def with_retries(label: str, fn, attempts: int = 5, first_delay: float = 15.0):
    """Retry Overpass calls with exponential backoff (Overpass asks clients to back off when busy)."""
    delay = first_delay
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except RETRYABLE as exc:
            if attempt == attempts:
                raise
            log.warning("%s failed (attempt %d/%d): %s. Retrying in %.0f s", label, attempt, attempts, str(exc).splitlines()[0], delay)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------------------------
# Overpass: landmarks by id
# --------------------------------------------------------------------------------------------

def fetch_elements(config: dict[str, Any], refs: list[str], refresh: bool) -> tuple[dict[str, dict], str | None]:
    """Fetch OSM elements (way/node only) with full geometry. Cached on disk."""
    by_type: dict[str, list[str]] = defaultdict(list)
    for ref in refs:
        kind, _, osm_id = ref.partition("/")
        if kind not in {"node", "way"} or not osm_id.isdigit():
            raise ValueError(f"Unsupported landmark reference {ref!r}; use node/<id> or way/<id>")
        by_type[kind].append(osm_id)
    parts = [f"{kind}(id:{','.join(ids)});" for kind, ids in sorted(by_type.items())]
    query = f"[out:json][timeout:60];({''.join(parts)});out geom tags;"
    cache_file = CACHE_DIR / f"landmarks-{hashlib.sha1(query.encode()).hexdigest()[:16]}.json"
    if cache_file.exists() and not refresh:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        log.info("Landmarks: using cached Overpass response %s", cache_file.name)
    else:
        url = config["overpassUrl"].rstrip("/") + "/interpreter"
        log.info("Landmarks: querying Overpass for %d elements", len(refs))

        def post() -> dict:
            resp = requests.post(url, data={"data": query}, headers={"User-Agent": config["userAgent"]}, timeout=120)
            resp.raise_for_status()
            return resp.json()

        data = with_retries("Landmark query", post)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data), encoding="utf-8", newline="\n")
        time.sleep(1.0)  # be polite to the shared Overpass instance
    timestamp = data.get("osm3s", {}).get("timestamp_osm_base")
    out: dict[str, dict] = {}
    for el in data.get("elements", []):
        out[f"{el['type']}/{el['id']}"] = el
    missing = [r for r in refs if r not in out]
    if missing:
        raise RuntimeError(f"Overpass did not return {missing}. Check the ids in the config.")
    return out, timestamp


def element_geometry(el: dict) -> Any:
    if el["type"] == "node":
        return Point(el["lon"], el["lat"])
    coords = [(p["lon"], p["lat"]) for p in el.get("geometry", []) if p]
    if len(coords) >= 4 and coords[0] == coords[-1]:
        return Polygon(coords)
    return LineString(coords)


# --------------------------------------------------------------------------------------------
# Graph
# --------------------------------------------------------------------------------------------

def configure_osmnx(config: dict[str, Any]) -> None:
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE_DIR / "osmnx")
    ox.settings.log_console = False
    ox.settings.http_user_agent = config["userAgent"]
    ox.settings.overpass_url = config["overpassUrl"].rstrip("/")
    ox.settings.overpass_rate_limit = True
    ox.settings.requests_timeout = 180
    ox.settings.useful_tags_way = sorted(set(ox.settings.useful_tags_way) | set(WAY_TAGS))
    ox.settings.useful_tags_node = sorted(set(ox.settings.useful_tags_node) | set(NODE_TAGS))


def build_graph(polygon: Polygon) -> tuple[nx.MultiDiGraph, dict[str, Any]]:
    stats: dict[str, Any] = {}
    walk_filter = ox._overpass._get_network_filter("walk")  # OSMnx's own walk definition
    stats["walkFilter"] = walk_filter
    stats["extraFilter"] = CYCLEWAY_FOOT_FILTER
    log.info("Graph: downloading OSM walk network (unsimplified)")
    G = with_retries(
        "Walk network download",
        lambda: ox.graph_from_polygon(
            polygon,
            network_type="walk",  # also makes every edge bidirectional
            custom_filter=[walk_filter, CYCLEWAY_FOOT_FILTER],
            simplify=False,
            retain_all=True,
            truncate_by_edge=False,
        ),
    )
    stats["rawNodes"] = G.number_of_nodes()
    stats["rawEdges"] = G.number_of_edges()

    # Drop ways whose access tags forbid walking and that have no explicit foot permission.
    removed = Counter()
    to_remove = []
    for u, v, k, d in G.edges(keys=True, data=True):
        access = {str(a).lower() for a in as_list(d.get("access"))}
        foot = {str(f).lower() for f in as_list(d.get("foot"))}
        if foot & {"no", "private"}:
            to_remove.append((u, v, k))
            removed["foot=no/private"] += 1
        elif access & ACCESS_FORBIDDEN and not (foot & FOOT_ALLOWED):
            to_remove.append((u, v, k))
            removed["access=no/private without foot permission"] += 1
    G.remove_edges_from(to_remove)
    stats["removedDirectedEdges"] = dict(removed)

    log.info("Graph: simplifying with attribute-preserving endpoints")
    G = ox.simplify_graph(G, node_attrs_include=NODE_ATTRS_INCLUDE, edge_attrs_differ=EDGE_ATTRS_DIFFER)

    # Self-loops never help a shortest path and confuse direction handling.
    loops = list(nx.selfloop_edges(G, keys=True))
    G.remove_edges_from(loops)
    stats["removedSelfLoops"] = len(loops)

    before_nodes = G.number_of_nodes()
    components = sorted(nx.strongly_connected_components(G), key=len, reverse=True)
    stats["componentsBeforePruning"] = len(components)
    G = ox.truncate.largest_component(G, strongly=True)
    stats["nodesDroppedOutsideLargestComponent"] = before_nodes - G.number_of_nodes()
    stats["nodes"] = G.number_of_nodes()
    stats["directedEdges"] = G.number_of_edges()
    log.info("Graph: %d nodes, %d directed edges after pruning", stats["nodes"], stats["directedEdges"])
    return G, stats


def edge_coords(G: nx.MultiDiGraph, u: int, v: int, d: dict) -> list[tuple[float, float]]:
    geom = d.get("geometry")
    if geom is not None:
        coords = [(float(x), float(y)) for x, y in geom.coords]
    else:
        coords = [(G.nodes[u]["x"], G.nodes[u]["y"]), (G.nodes[v]["x"], G.nodes[v]["y"])]
    # Pin the ends exactly to the node positions so geometry and topology agree.
    coords[0] = (G.nodes[u]["x"], G.nodes[u]["y"])
    coords[-1] = (G.nodes[v]["x"], G.nodes[v]["y"])
    return coords


def pair_segments(G: nx.MultiDiGraph) -> list[dict[str, Any]]:
    """Group reciprocal directed edges into undirected segments with direction flags."""
    groups: dict[tuple, dict[str, Any]] = {}
    for u, v, k, d in G.edges(keys=True, data=True):
        coords = edge_coords(G, u, v, d)
        a, b = (u, v) if u < v else (v, u)
        oriented = coords if u == a else list(reversed(coords))
        geom_key = tuple((round(x, 6), round(y, 6)) for x, y in oriented)
        key = (a, b, geom_key)
        seg = groups.get(key)
        if seg is None:
            seg = {"u": a, "v": b, "coords": oriented, "data": d, "fwd": False, "bwd": False, "lengths": []}
            groups[key] = seg
        if u == a:
            seg["fwd"] = True
        else:
            seg["bwd"] = True
        seg["lengths"].append(float(d["length"]))
    segments = list(groups.values())
    segments.sort(key=lambda s: (s["u"], s["v"], s["coords"][1] if len(s["coords"]) > 1 else s["coords"][0]))
    return segments


# --------------------------------------------------------------------------------------------
# Lighting evidence
# --------------------------------------------------------------------------------------------

def fetch_lamps(polygon_lonlat: Polygon, to_m: Transformer, to_ll: Transformer, radius: float) -> list[dict[str, Any]]:
    poly_m = shp_transform(to_m.transform, polygon_lonlat).buffer(radius + 5)
    poly_query = shp_transform(to_ll.transform, poly_m)
    log.info("Lamps: downloading highway=street_lamp")
    try:
        gdf = with_retries("Street lamp download", lambda: ox.features_from_polygon(poly_query, tags={"highway": "street_lamp"}))
    except ox._errors.InsufficientResponseError:
        log.warning("Lamps: none mapped in the area")
        return []
    lamps = []
    for idx, row in gdf.iterrows():
        kind, osm_id = idx if isinstance(idx, tuple) else ("node", idx)
        if kind != "node" or row.geometry is None or row.geometry.geom_type != "Point":
            continue
        tags = {}
        for t in ("lamp_type", "lamp_mount", "light:method", "light:colour", "light:count", "support", "ref", "operator"):
            if t in row.index and not is_missing(row[t]):
                tags[t] = str(row[t])
        lamps.append({"id": int(osm_id), "lon": float(row.geometry.x), "lat": float(row.geometry.y), "tags": tags})
    lamps.sort(key=lambda l: l["id"])
    log.info("Lamps: %d mapped lamp nodes", len(lamps))
    return lamps


def lamp_intervals(line_m: LineString, tree: shapely.STRtree, radius: float, step: float) -> tuple[list[tuple[float, float]], set[int]]:
    """Fractions of the line within `radius` metres of any lamp, sampled every `step` metres."""
    length = line_m.length
    if length <= 0:
        return [], set()
    n = max(1, int(math.ceil(length / step)))
    bounds = np.minimum(np.arange(n + 1) * step, length)
    mids = (bounds[:-1] + bounds[1:]) / 2.0
    points = shapely.line_interpolate_point(line_m, mids)
    pairs = tree.query(points, predicate="dwithin", distance=radius)
    covered = np.zeros(n, dtype=bool)
    lamp_idx: set[int] = set()
    if pairs.size:
        covered[pairs[0]] = True
        lamp_idx = {int(i) for i in pairs[1]}
    intervals = []
    i = 0
    while i < n:
        if covered[i]:
            j = i
            while j + 1 < n and covered[j + 1]:
                j += 1
            intervals.append((bounds[i] / length, bounds[j + 1] / length))
            i = j + 1
        else:
            i += 1
    return intervals, lamp_idx


def lighting_for_segment(lit_class: str | None, lamp_ranges: list[tuple[float, float]]) -> list[list[Any]]:
    if lit_class is not None:
        return [[0.0, 1.0, lit_class]]
    out: list[list[Any]] = []
    cursor = 0.0
    for a, b in lamp_ranges:
        if a > cursor:
            out.append([cursor, a, "unknown"])
        out.append([a, b, "likely_lit"])
        cursor = b
    if cursor < 1.0:
        out.append([cursor, 1.0, "unknown"])
    # Round and drop slivers created by rounding.
    rounded = []
    for a, b, c in out:
        ra, rb = round(a, 4), round(b, 4)
        if rb > ra:
            rounded.append([ra, rb, c])
    if rounded:
        rounded[0][0] = 0.0
        rounded[-1][1] = 1.0
    return rounded


# --------------------------------------------------------------------------------------------
# Main pipeline
# --------------------------------------------------------------------------------------------

def run(config_path: Path, out_dir: Path, report_path: Path, refresh: bool) -> None:
    started = datetime.now(timezone.utc)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if refresh and CACHE_DIR.exists():
        log.info("Refresh: clearing %s", CACHE_DIR)
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    configure_osmnx(config)

    to_m = Transformer.from_crs("EPSG:4326", config["projectedCrs"], always_xy=True)
    to_ll = Transformer.from_crs(config["projectedCrs"], "EPSG:4326", always_xy=True)

    # 1. Landmarks and study area ---------------------------------------------------------
    lm_cfg = config["landmarks"]
    elements, landmark_ts = fetch_elements(config, [l["osm"] for l in lm_cfg], refresh)
    anchors = [elements[l["osm"]] for l in lm_cfg if l["id"] in config["anchorLandmarkIds"]]
    anchor_union = shapely.union_all([shp_transform(to_m.transform, element_geometry(a)) for a in anchors])
    minx, miny, maxx, maxy = anchor_union.bounds
    buf = float(config["bufferMetres"])
    area_m = box(minx - buf, miny - buf, maxx + buf, maxy + buf)
    area_ll = shp_transform(to_ll.transform, area_m)
    log.info("Study area: %.0f m x %.0f m (%.2f km2)", area_m.bounds[2] - area_m.bounds[0], area_m.bounds[3] - area_m.bounds[1], area_m.area / 1e6)

    # 2. Graph -----------------------------------------------------------------------------
    G, graph_stats = build_graph(area_ll)
    segments = pair_segments(G)

    # 3. Lamps and lighting ----------------------------------------------------------------
    radius = float(config["lamp"]["radiusMetres"])
    step = float(config["lamp"]["sampleStepMetres"])
    lamps = fetch_lamps(area_ll, to_m, to_ll, radius)
    lamp_points_m = [Point(*to_m.transform(l["lon"], l["lat"])) for l in lamps]
    tree = shapely.STRtree(lamp_points_m) if lamp_points_m else None

    node_ids = sorted(G.nodes)
    node_index = {n: i for i, n in enumerate(node_ids)}

    lighting_m = Counter()
    lit_notes = Counter()
    lit_raw = Counter()
    tag_metres = Counter()
    highway_metres = Counter()
    steps_count = 0
    exported_edges = []
    used_lamps: set[int] = set()
    total_m = 0.0
    length_mismatch_max = 0.0

    for seg_id, seg in enumerate(segments):
        d = seg["data"]
        length = float(np.mean(seg["lengths"]))
        line_ll = LineString(seg["coords"])
        line_m = shp_transform(to_m.transform, line_ll)
        # OSMnx lengths are great-circle metres; compare with projected length as a sanity check.
        length_mismatch_max = max(length_mismatch_max, abs(line_m.length - length) / max(length, 1.0))
        total_m += length

        tags: dict[str, Any] = {}
        for t in WAY_TAGS:
            if t in d:
                val = scalar(d[t])
                if val is not None:
                    tags[t] = val
        hw = tags.get("highway")
        highway_metres[str(hw)] += length
        if hw == "steps":
            steps_count += 1
        for t in ("surface", "smoothness", "incline", "wheelchair", "width", "kerb", "step_count", "handrail", "tactile_paving"):
            if t in tags:
                tag_metres[t] += length
        if any(t in tags for t in ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")):
            tag_metres["sidewalk"] += length

        lit_class, note = classify_lit(tags.get("lit"))
        if "lit" in tags:
            lit_raw[str(tags["lit"])] += 1
        if note:
            lit_notes[note] += 1
        lamp_ranges: list[tuple[float, float]] = []
        lamp_ids: list[int] = []
        if tree is not None:
            lamp_ranges, idx = lamp_intervals(line_m, tree, radius, step)
            lamp_ids = sorted(lamps[i]["id"] for i in idx)
            used_lamps.update(lamp_ids)
        light = lighting_for_segment(lit_class, lamp_ranges)
        for a, b, c in light:
            lighting_m[c] += (b - a) * length

        flat = []
        for x, y in seg["coords"]:
            flat.extend((round_coord(x), round_coord(y)))
        edge = {
            "id": seg_id,
            "u": node_index[seg["u"]],
            "v": node_index[seg["v"]],
            "len": round(length, 2),
            "fwd": seg["fwd"],
            "bwd": seg["bwd"],
            "ways": sorted({int(w) for w in as_list(d.get("osmid"))}),
            "tags": tags,
            "light": light,
            "g": flat,
        }
        if lamp_ids:
            edge["lamps"] = lamp_ids
        exported_edges.append(edge)

    # Nodes ---------------------------------------------------------------------------------
    node_coords: list[float] = []
    node_tags_out: dict[str, dict[str, Any]] = {}
    node_tag_counts = Counter()
    for i, n in enumerate(node_ids):
        nd = G.nodes[n]
        node_coords.extend((round_coord(nd["x"]), round_coord(nd["y"])))
        nt = {}
        for t in NODE_TAGS:
            if t in nd and not is_missing(nd[t]):
                nt[t] = str(nd[t])
        if nt:
            node_tags_out[str(i)] = nt
            for t, val in nt.items():
                node_tag_counts[f"{t}={val}" if t in ("kerb", "barrier", "crossing", "highway") else t] += 1

    # Landmarks: label point from OSM geometry, routing point = nearest point on the graph ----
    edge_lines_m = [shp_transform(to_m.transform, LineString(s["coords"])) for s in segments]
    edge_tree = shapely.STRtree(edge_lines_m)
    landmarks_out = []
    skipped_landmarks = []
    for l in lm_cfg:
        el = elements[l["osm"]]
        geom_ll = element_geometry(el)
        label_pt = geom_ll.representative_point() if geom_ll.geom_type == "Polygon" else geom_ll.interpolate(0.5, normalized=True) if geom_ll.geom_type == "LineString" else geom_ll
        label_m = Point(*to_m.transform(label_pt.x, label_pt.y))
        if not area_m.contains(label_m):
            skipped_landmarks.append({"id": l["id"], "reason": "outside study area"})
            continue
        nearest_idx = int(edge_tree.nearest(label_m))
        line = edge_lines_m[nearest_idx]
        snap_m = line.interpolate(line.project(label_m))
        snap_ll = to_ll.transform(snap_m.x, snap_m.y)
        dist = float(label_m.distance(snap_m))
        landmarks_out.append({
            "id": l["id"],
            "label": l["label"],
            "category": l["category"],
            "osm": l["osm"],
            "osmName": el.get("tags", {}).get("name"),
            "labelPoint": [round_coord(label_pt.x), round_coord(label_pt.y)],
            "routingPoint": [round_coord(snap_ll[0]), round_coord(snap_ll[1])],
            "routingPointDistanceM": round(dist, 1),
            "routingEdgeId": nearest_idx,
        })

    # Provenance -----------------------------------------------------------------------------
    osm_timestamps = set()
    if landmark_ts:
        osm_timestamps.add(landmark_ts)
    for f in (CACHE_DIR / "osmnx").glob("*.json"):
        try:
            ts = json.loads(f.read_text(encoding="utf-8")).get("osm3s", {}).get("timestamp_osm_base")
            if ts:
                osm_timestamps.add(ts)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

    lighting_summary = {c: round(lighting_m.get(c, 0.0), 1) for c in ("mapped_lit", "likely_lit", "mapped_unlit", "unknown")}
    coverage_ring = [[round_coord(x), round_coord(y)] for x, y in area_ll.exterior.coords]
    bbox = [round_coord(v) for v in area_ll.bounds]

    meta = {
        "schemaVersion": SCHEMA_VERSION,
        "synthetic": False,
        "areaId": config["areaId"],
        "areaName": config["areaName"],
        "generatedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "osmDataTimestamps": sorted(osm_timestamps),
        "coverage": {
            "type": "Polygon",
            "coordinates": [coverage_ring],
            "bbox": bbox,
            "method": f"Bounding box of anchor landmarks {config['anchorLandmarkIds']} buffered by {buf:.0f} m in {config['projectedCrs']}",
            "areaKm2": round(area_m.area / 1e6, 3),
        },
        "parameters": {
            "lampRadiusMetres": radius,
            "lampSampleStepMetres": step,
            "litYesValues": sorted(LIT_YES),
            "litNoValues": sorted(LIT_NO),
            "edgeAttrsDiffer": EDGE_ATTRS_DIFFER,
            "nodeAttrsInclude": NODE_ATTRS_INCLUDE,
        },
        "counts": {
            "nodes": len(node_ids),
            "segments": len(exported_edges),
            "directedEdges": sum(int(e["fwd"]) + int(e["bwd"]) for e in exported_edges),
            "totalLengthM": round(total_m, 1),
            "lampsMapped": len(lamps),
            "lampsNearNetwork": len(used_lamps),
            "stepsSegments": steps_count,
            "landmarks": len(landmarks_out),
        },
        "lightingMetres": lighting_summary,
        "lightingNotes": dict(lit_notes),
        "litTagValues": dict(lit_raw),
        "accessibilityTagMetres": {k: round(v, 1) for k, v in sorted(tag_metres.items())},
        "highwayMetres": {k: round(v, 1) for k, v in sorted(highway_metres.items(), key=lambda kv: -kv[1])},
        "nodeTagCounts": dict(sorted(node_tag_counts.items())),
        "elevation": {"available": False, "note": "No elevation model is used. Slope is unknown except where OSM `incline` tags exist."},
        "graphBuild": {**graph_stats, "maxRelativeLengthDifferenceProjectedVsGeodesic": round(length_mismatch_max, 5)},
        "skippedLandmarks": skipped_landmarks,
        "sources": [
            {"name": "OpenStreetMap", "licence": "ODbL-1.0", "url": "https://www.openstreetmap.org/copyright", "attribution": "© OpenStreetMap contributors", "via": f"Overpass API ({config['overpassUrl']})"},
        ],
        "software": {
            "python": platform.python_version(),
            "osmnx": ox.__version__,
            "networkx": nx.__version__,
            "shapely": shapely.__version__,
        },
        "licence": "Derived from OpenStreetMap data. Open Database License 1.0 (ODbL). © OpenStreetMap contributors.",
    }

    graph_doc = {
        "schema": "solas-graph",
        "meta": meta,
        "nodes": {"coords": node_coords, "osmIds": [int(n) for n in node_ids], "tags": node_tags_out},
        "edges": exported_edges,
        "lamps": [{"id": l["id"], "c": [round_coord(l["lon"]), round_coord(l["lat"])], **({"tags": l["tags"]} if l["tags"] else {})} for l in lamps],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    graph_path = out_dir / "graph.json"
    graph_path.write_text(json.dumps(graph_doc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8", newline="\n")
    manifest = {
        "schema": "solas-manifest",
        "schemaVersion": SCHEMA_VERSION,
        "synthetic": False,
        "areaId": meta["areaId"],
        "areaName": meta["areaName"],
        "generatedAt": meta["generatedAt"],
        "osmDataTimestamps": meta["osmDataTimestamps"],
        "coverage": meta["coverage"],
        "counts": meta["counts"],
        "lightingMetres": meta["lightingMetres"],
        "licence": meta["licence"],
        "graph": {"path": "data/cork/graph.json", "bytes": graph_path.stat().st_size, "sha256": sha256_file(graph_path)},
        "landmarks": landmarks_out,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    write_report(report_path, meta, landmarks_out, manifest)
    log.info("Wrote %s (%.1f KB) and manifest.json", graph_path.relative_to(ROOT), graph_path.stat().st_size / 1024)


def pct(part: float, whole: float) -> str:
    return f"{(100.0 * part / whole):.1f}%" if whole else "n/a"


def write_report(path: Path, meta: dict, landmarks: list[dict], manifest: dict) -> None:
    total = meta["counts"]["totalLengthM"]
    lm = meta["lightingMetres"]
    lines = [
        "# Cork dataset report",
        "",
        "Generated by `scripts/prepare_cork_data.py`. Do not edit by hand; re-run the script.",
        "",
        f"- Area: **{meta['areaName']}** (`{meta['areaId']}`), {meta['coverage']['areaKm2']} km²",
        f"- Coverage method: {meta['coverage']['method']}",
        f"- Bounding box (W, S, E, N): {meta['coverage']['bbox']}",
        f"- Generated: {meta['generatedAt']}",
        f"- OSM data timestamp(s): {', '.join(meta['osmDataTimestamps']) or 'unknown'}",
        f"- Software: Python {meta['software']['python']}, OSMnx {meta['software']['osmnx']}, NetworkX {meta['software']['networkx']}, Shapely {meta['software']['shapely']}",
        f"- Graph file: `public/{manifest['graph']['path']}` ({manifest['graph']['bytes'] / 1024:.0f} KB, sha256 `{manifest['graph']['sha256'][:16]}…`)",
        "",
        "## Network",
        "",
        f"- Nodes: {meta['counts']['nodes']}",
        f"- Segments (undirected): {meta['counts']['segments']}; directed edges: {meta['counts']['directedEdges']}",
        f"- Total segment length: {total / 1000:.2f} km",
        f"- Steps segments (`highway=steps`): {meta['counts']['stepsSegments']}",
        f"- Raw OSM graph before simplification: {meta['graphBuild']['rawNodes']} nodes, {meta['graphBuild']['rawEdges']} directed edges",
        f"- Directed edges removed for access: {meta['graphBuild']['removedDirectedEdges'] or 'none'}",
        f"- Connected components before pruning: {meta['graphBuild']['componentsBeforePruning']}; nodes dropped outside the largest: {meta['graphBuild']['nodesDroppedOutsideLargestComponent']}",
        f"- Max relative length difference (projected vs geodesic): {meta['graphBuild']['maxRelativeLengthDifferenceProjectedVsGeodesic']}",
        "",
        "### Length by highway type",
        "",
        "| highway | metres | share |",
        "| --- | ---: | ---: |",
    ]
    for hw, m in meta["highwayMetres"].items():
        lines.append(f"| {hw} | {m:,.0f} | {pct(m, total)} |")
    lines += [
        "",
        "## Lighting evidence (distance-weighted)",
        "",
        f"Lamp radius {meta['parameters']['lampRadiusMetres']} m, sampled every {meta['parameters']['lampSampleStepMetres']} m. "
        f"{meta['counts']['lampsMapped']} lamps mapped in or near the area; {meta['counts']['lampsNearNetwork']} are within the radius of the network.",
        "",
        "| class | metres | share | evidence |",
        "| --- | ---: | ---: | --- |",
        f"| mapped_lit | {lm['mapped_lit']:,.0f} | {pct(lm['mapped_lit'], total)} | explicit `lit=yes`-style tag on the way |",
        f"| likely_lit | {lm['likely_lit']:,.0f} | {pct(lm['likely_lit'], total)} | no `lit` tag; within radius of a mapped street lamp (inferred, not confirmed) |",
        f"| mapped_unlit | {lm['mapped_unlit']:,.0f} | {pct(lm['mapped_unlit'], total)} | explicit `lit=no` / `lit=disused` |",
        f"| unknown | {lm['unknown']:,.0f} | {pct(lm['unknown'], total)} | no usable evidence (not the same as unlit) |",
        "",
        f"`lit` tag values seen on segments: {meta['litTagValues'] or 'none'}",
        f"Notes: {meta['lightingNotes'] or 'none'}",
        "",
        "## Accessibility-relevant tags (metres of segments carrying the tag)",
        "",
        "| tag | metres | share |",
        "| --- | ---: | ---: |",
    ]
    for t, m in meta["accessibilityTagMetres"].items():
        lines.append(f"| {t} | {m:,.0f} | {pct(m, total)} |")
    lines += [
        "",
        f"Node tags: {meta['nodeTagCounts'] or 'none'}",
        "",
        f"Elevation: {meta['elevation']['note']}",
        "",
        "## Landmarks",
        "",
        "Label point = inside the OSM feature. Routing point = nearest point on the walking network.",
        "",
        "| id | label | OSM | routing point distance |",
        "| --- | --- | --- | ---: |",
    ]
    for l in landmarks:
        lines.append(f"| {l['id']} | {l['label']} | [{l['osm']}](https://www.openstreetmap.org/{l['osm']}) | {l['routingPointDistanceM']} m |")
    if meta["skippedLandmarks"]:
        lines += ["", f"Skipped: {meta['skippedLandmarks']}"]
    lines += ["", "Licence: " + meta["licence"], ""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--refresh", action="store_true", help="ignore cached Overpass responses")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        run(args.config, args.out_dir, args.report, args.refresh)
    except (*RETRYABLE, ox._errors.InsufficientResponseError) as exc:
        log.error("Data download failed: %s", exc)
        log.error("No dataset was written. The app will show its 'data unavailable' state; do not substitute synthetic data.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
