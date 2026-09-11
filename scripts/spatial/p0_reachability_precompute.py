#!/usr/bin/env python
"""Create deterministic PHASE-04 P0 reachability and network isochrones.

The module deliberately reuses PHASE-03's strict graph/snap loaders.  It never
rebuilds the road graph and never uses isochrone polygons to classify merchants.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import statistics
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import substring, transform as geometry_transform, unary_union
from shapely.strtree import STRtree

import p0_routing_validation as routing
from p0_ingestion import (
    ANALYSIS_VERSION,
    METRIC_CRS,
    WEB_CRS,
    ValidationError,
    atomic_write_json,
    atomic_write_text,
    relative_source_path,
    sha256_file,
)

try:
    from shapely import make_valid
except ImportError:  # pragma: no cover - compatibility with older Shapely.
    from shapely.validation import make_valid


STOP_THRESHOLD_M = 30.0
MERCHANT_THRESHOLD_M = 50.0
WALKING_SPEED_MPS = 1.3
ISOCHRONE_BUFFER_M = 10.0
ISOCHRONE_METHOD = "network_dijkstra_edge_intervals_buffer_v1"
BUFFER_QUAD_SEGS = 8
BUFFER_CAP_STYLE = "round"
BUFFER_JOIN_STYLE = "round"
NUMERIC_TOLERANCE_M = 1e-6
NESTING_AREA_TOLERANCE_M2 = 1e-4
OUTPUT_FILENAMES = {
    "stop_snaps": "stop_snaps_p0.geojson",
    "merchant_snaps": "merchant_snaps_p0.geojson",
    "access": "stop_merchant_access.geojson",
    "isochrones": "stop_isochrones.geojson",
}
INTERIM_FILENAMES = {
    "overlay": "phase04_isochrone_validation.geojson",
    "html": "phase04_isochrone_validation.html",
    "review": "phase04_isochrone_visual_review.json",
}


@dataclass(frozen=True)
class CanonicalSnap:
    snap: routing.Snap
    snap_acceptance_status: str
    routing_status: str


@dataclass(frozen=True)
class IsochroneResult:
    stop_id: str
    duration_min: int
    duration_seconds: int
    linework_metric: Any
    polygon_metric: Any
    bridge_pairs: tuple[tuple[str, str], ...]


def config_fingerprint() -> tuple[dict[str, Any], str]:
    config = {
        "method": ISOCHRONE_METHOD,
        "isochrone_buffer_m": ISOCHRONE_BUFFER_M,
        "buffer_quad_segs": BUFFER_QUAD_SEGS,
        "buffer_cap_style": BUFFER_CAP_STYLE,
        "buffer_join_style": BUFFER_JOIN_STYLE,
        "walking_speed_mps": WALKING_SPEED_MPS,
        "stop_threshold_m": STOP_THRESHOLD_M,
        "merchant_threshold_m": MERCHANT_THRESHOLD_M,
        "edge_interval_rule": "undirected_endpoint_union_v1",
    }
    encoded = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return config, hashlib.sha256(encoded).hexdigest().upper()


def acceptance_status(snap: routing.Snap) -> str:
    return "accepted" if snap.routing_status == "routable" else snap.routing_status


def canonicalize_snaps(snaps: list[routing.Snap], counterpart_components: set[str]) -> list[CanonicalSnap]:
    result: list[CanonicalSnap] = []
    for snap in snaps:
        accepted = acceptance_status(snap)
        if accepted == "accepted":
            assert snap.component_id is not None
            status = "routable" if snap.component_id in counterpart_components else "disconnected"
        else:
            status = accepted
        result.append(CanonicalSnap(snap, accepted, status))
    return result


def edge_intervals(length_m: float, distance_u: float | None, distance_v: float | None, budget_m: float) -> list[tuple[float, float]]:
    """Return selected intervals in stored u->v orientation for one undirected edge."""
    if not math.isfinite(length_m) or length_m <= 0 or not math.isfinite(budget_m):
        raise ValidationError("Edge length and isochrone budget must be finite and positive")

    def reachable(distance: float | None) -> float:
        if distance is None or not math.isfinite(distance):
            return 0.0
        return min(length_m, max(0.0, budget_m - distance))

    prefix_u, prefix_v = reachable(distance_u), reachable(distance_v)
    intervals: list[tuple[float, float]] = []
    if prefix_u > NUMERIC_TOLERANCE_M:
        intervals.append((0.0, prefix_u))
    if prefix_v > NUMERIC_TOLERANCE_M:
        intervals.append((length_m - prefix_v, length_m))
    if not intervals:
        return []
    intervals.sort()
    if len(intervals) == 2 and intervals[0][1] + NUMERIC_TOLERANCE_M >= intervals[1][0]:
        return [(0.0, length_m)]
    return intervals


def metric_geometry(line_web: LineString, to_metric: Transformer) -> LineString:
    value = geometry_transform(to_metric.transform, line_web)
    if value.geom_type != "LineString" or value.is_empty:
        raise ValidationError("Graph edge cannot be transformed to a metric LineString")
    return value


def clip_metric_line(line: LineString, stored_length_m: float, start_m: float, end_m: float) -> LineString:
    if stored_length_m <= 0 or line.length <= 0:
        raise ValidationError("Cannot clip zero-length edge")
    start = min(line.length, max(0.0, line.length * start_m / stored_length_m))
    end = min(line.length, max(0.0, line.length * end_m / stored_length_m))
    value = substring(line, start, end)
    if value.geom_type != "LineString" or value.is_empty or value.length <= 0:
        raise ValidationError("Reachable edge interval produced invalid linework")
    return value


def polygonal_only(value: Any) -> Any:
    value = make_valid(value)
    if value.is_empty:
        raise ValidationError("Isochrone polygon is empty after validity processing")
    if value.geom_type == "Polygon":
        return value
    if value.geom_type == "MultiPolygon":
        return value
    polygons = [item for item in getattr(value, "geoms", ()) if item.geom_type == "Polygon" and not item.is_empty]
    if not polygons:
        raise ValidationError("Isochrone validity processing yielded no polygonal geometry")
    return MultiPolygon(polygons) if len(polygons) > 1 else polygons[0]


def metric_nesting_excess_m2(iso5_metric: Any, iso10_metric: Any) -> tuple[float, float]:
    """Return the authoritative EPSG:32749 5-in-10 excess and tolerance."""
    if iso5_metric.is_empty or iso10_metric.is_empty:
        raise ValidationError("Cannot validate nesting for empty isochrone geometry")
    return (
        iso5_metric.difference(iso10_metric).area,
        max(NESTING_AREA_TOLERANCE_M2, 1e-9 * iso5_metric.area),
    )


def detect_component_buffer_bridges(records: list[tuple[str, str, LineString]]) -> tuple[tuple[str, str], ...]:
    """Detect a buffer merge across distinct graph-connected source linework.

    Nearby nonincident streets in the *same* source-reachable graph component
    are not a remote-island bridge: they do not add any unreachable graph
    member. They remain visible in the all-stop visual QA artifact. A merge of
    independently connected source linework components, by contrast, would be
    a misleading buffer-created connection and is flagged deterministically.
    """
    if len(records) < 2:
        return ()
    buffered = [line.buffer(ISOCHRONE_BUFFER_M, quad_segs=BUFFER_QUAD_SEGS, cap_style=BUFFER_CAP_STYLE, join_style=BUFFER_JOIN_STYLE) for _, _, line in records]
    tree = STRtree(buffered)
    bridges: set[tuple[str, str]] = set()
    for index, (edge_id, component_id, _) in enumerate(records):
        for candidate in tree.query(buffered[index], predicate="intersects"):
            other_index = int(candidate)
            if other_index <= index:
                continue
            other_id, other_component_id, _ = records[other_index]
            if component_id != other_component_id:
                bridges.add(tuple(sorted((edge_id, other_id))))
    return tuple(sorted(bridges))


def build_isochrone(
    stop: CanonicalSnap,
    duration_seconds: int,
    distances: dict[str, float],
    nodes: dict[str, routing.Node],
    edges: list[routing.Edge],
    to_metric: Transformer,
) -> IsochroneResult:
    snap = stop.snap
    if stop.routing_status != "routable" or snap.node_id is None or snap.snap_distance_m is None or snap.target.point_web is None:
        raise ValidationError("Isochrone requested for a non-routable stop")
    budget = duration_seconds * WALKING_SPEED_MPS - snap.snap_distance_m
    if budget < -NUMERIC_TOLERANCE_M:
        raise ValidationError(f"Stop {snap.target.target_id} has no graph budget at {duration_seconds} seconds")
    origin_metric = Point(*to_metric.transform(snap.target.point_web.x, snap.target.point_web.y))
    source_node = nodes[snap.node_id]
    connector = LineString((origin_metric, Point(source_node.x_m, source_node.y_m)))
    selected: list[tuple[str, tuple[str, str], LineString]] = [("connector", (snap.node_id, snap.node_id), connector)]
    for edge in edges:
        d_u = distances.get(edge.source_node)
        d_v = distances.get(edge.target_node)
        intervals = edge_intervals(edge.length_m, d_u, d_v, budget)
        if not intervals:
            continue
        metric_line = metric_geometry(edge.geometry_web, to_metric)
        for start, end in intervals:
            selected.append((edge.edge_id, (edge.source_node, edge.target_node), clip_metric_line(metric_line, edge.length_m, start, end)))
    linework = unary_union([item[2] for item in selected])
    if linework.is_empty:
        raise ValidationError("Isochrone reachable linework is empty")
    buffered = [item[2].buffer(ISOCHRONE_BUFFER_M, quad_segs=BUFFER_QUAD_SEGS, cap_style=BUFFER_CAP_STYLE, join_style=BUFFER_JOIN_STYLE) for item in selected]
    bridge_records = [(edge_id, nodes[endpoints[0]].component_id, line) for edge_id, endpoints, line in selected]
    bridge_pairs = detect_component_buffer_bridges(bridge_records)
    polygon = polygonal_only(unary_union(buffered))
    if not polygon.covers(origin_metric):
        raise ValidationError("Explicit source connector did not place stop origin inside service area")
    return IsochroneResult(snap.target.target_id, duration_seconds // 60, duration_seconds, linework, polygon, bridge_pairs)


def snap_feature(item: CanonicalSnap, kind: str, analysis_version: str, lineage: dict[str, str], fingerprint: str) -> dict[str, Any]:
    snap = item.snap
    props = {
        "analysis_version": analysis_version,
        "entity_type": kind,
        f"{kind}_id": snap.target.target_id,
        f"{kind}_name": snap.target.display_name,
        "node_id": snap.node_id,
        "snap_distance_m": snap.snap_distance_m,
        "component_id": snap.component_id,
        "snap_acceptance_status": item.snap_acceptance_status,
        "routing_status": item.routing_status,
        "threshold_m": snap.threshold_m,
        "input_lineage": lineage,
        "method_config_fingerprint": fingerprint,
    }
    return {"type": "Feature", "geometry": mapping(snap.target.point_web) if snap.target.point_web else None, "properties": props}


def pair_record(
    stop: CanonicalSnap, merchant: CanonicalSnap, distances: dict[str, float] | None,
    paths: dict[str, list[str]] | None, analysis_version: str,
) -> dict[str, Any]:
    status_priority = ("invalid_geometry", "snap_too_far", "disconnected")
    statuses = (stop.routing_status, merchant.routing_status)
    status = next((value for value in status_priority if value in statuses), "routable")
    props: dict[str, Any] = {
        "analysis_version": analysis_version,
        "stop_id": stop.snap.target.target_id,
        "merchant_id": merchant.snap.target.target_id,
        "stop_node_id": stop.snap.node_id,
        "merchant_node_id": merchant.snap.node_id,
        "stop_component_id": stop.snap.component_id,
        "merchant_component_id": merchant.snap.component_id,
        "stop_snap_distance_m": stop.snap.snap_distance_m,
        "merchant_snap_distance_m": merchant.snap.snap_distance_m,
        "stop_snap_acceptance_status": stop.snap_acceptance_status,
        "merchant_snap_acceptance_status": merchant.snap_acceptance_status,
        "stop_routing_status": stop.routing_status,
        "merchant_routing_status": merchant.routing_status,
        "routing_status": status,
        "network_distance_m": None,
        "total_distance_m": None,
        "walking_time_seconds": None,
        "walking_time_min": None,
        "reachable_5min": None,
        "reachable_10min": None,
        "path_node_ids": [],
    }
    if status != "routable":
        return {"type": "Feature", "geometry": None, "properties": props}
    assert distances is not None and paths is not None and stop.snap.node_id and merchant.snap.node_id
    if merchant.snap.node_id not in distances or merchant.snap.node_id not in paths:
        props["routing_status"] = "disconnected"
        return {"type": "Feature", "geometry": None, "properties": props}
    network = distances[merchant.snap.node_id]
    total = (stop.snap.snap_distance_m or 0.0) + network + (merchant.snap.snap_distance_m or 0.0)
    seconds = total / WALKING_SPEED_MPS
    props.update({
        "network_distance_m": network,
        "total_distance_m": total,
        "walking_time_seconds": seconds,
        "walking_time_min": seconds / 60.0,
        "reachable_5min": seconds <= 300.0,
        "reachable_10min": seconds <= 600.0,
        "path_node_ids": paths[merchant.snap.node_id],
    })
    return {"type": "Feature", "geometry": None, "properties": props}


def require_phase03_match(
    phase03_stops: Path, phase03_merchants: Path, phase03_slice: Path,
    stops: list[CanonicalSnap], merchants: list[CanonicalSnap], access: list[dict[str, Any]],
) -> None:
    baseline_stops = {feature["properties"]["stop_id"]: feature["properties"] for feature in routing.read_json(phase03_stops)["features"]}
    baseline_merchants = {feature["properties"]["merchant_id"]: feature["properties"] for feature in routing.read_json(phase03_merchants)["features"]}
    for item in [*stops, *merchants]:
        key = "stop_id" if item.snap.target.target_id in baseline_stops else "merchant_id"
        baseline = baseline_stops.get(item.snap.target.target_id) if key == "stop_id" else baseline_merchants.get(item.snap.target.target_id)
        if baseline is None or baseline.get("node_id") != item.snap.node_id or not math.isclose(float(baseline.get("snap_distance_m")), float(item.snap.snap_distance_m), abs_tol=NUMERIC_TOLERANCE_M):
            raise ValidationError("Reproduced Phase-04 snap differs from Phase-03 baseline")
    records = {(feature["properties"]["stop_id"], feature["properties"]["merchant_id"]): feature["properties"] for feature in access}
    slice_doc = routing.read_json(phase03_slice)
    primary = slice_doc.get("primary_stop_id")
    for route in slice_doc.get("routes", []):
        actual = records.get((primary, route.get("merchant_id")))
        if actual is None:
            raise ValidationError("Phase-03 route is absent from access output")
        old_status = route.get("primary_route_status") or route.get("routing_status")
        if old_status == "routable":
            for old_key, new_key in (("graph_shortest_path_distance_m", "network_distance_m"), ("total_distance_m", "total_distance_m"), ("walking_time_seconds", "walking_time_seconds")):
                if not math.isclose(float(route[old_key]), float(actual[new_key]), abs_tol=NUMERIC_TOLERANCE_M):
                    raise ValidationError("Phase-04 primary route regresses from Phase-03")
        elif old_status in {"snap_too_far", "invalid_geometry", "disconnected"} and actual["routing_status"] != old_status:
            raise ValidationError("Phase-04 primary non-routable status regresses from Phase-03")


def per_stop_metrics(access: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for feature in access:
        grouped.setdefault(feature["properties"]["stop_id"], []).append(feature["properties"])
    metrics: list[dict[str, Any]] = []
    for stop_id, rows in sorted(grouped.items()):
        finite = [row for row in rows if row["routing_status"] == "routable"]
        within_ten = [row["walking_time_min"] for row in finite if row["reachable_10min"]]
        all_times = [row["walking_time_min"] for row in finite]
        status_counts = Counter(row["routing_status"] for row in rows)
        metrics.append({
            "stop_id": stop_id,
            "pair_count": len(rows),
            "routable_merchant_count": len(finite),
            "reachable_5min_count": sum(row["reachable_5min"] is True for row in finite),
            "reachable_10min_count": sum(row["reachable_10min"] is True for row in finite),
            "unroutable_merchant_count": len(rows) - len(finite),
            "median_reachable_10min_walking_time_min": statistics.median(within_ten) if within_ten else None,
            "median_all_routable_walking_time_min": statistics.median(all_times) if all_times else None,
            "status_counts": dict(sorted(status_counts.items())),
        })
    return metrics


def add_outlier_flags(metrics: list[dict[str, Any]]) -> None:
    for metric in metrics:
        flags: list[str] = []
        if metric["routable_merchant_count"] == 0:
            flags.append("stop_unroutable")
        if metric["reachable_10min_count"] == 0:
            flags.append("zero_reachable_10min")
        metric["outlier_review_flags"] = flags
    for field in ("reachable_10min_count", "median_reachable_10min_walking_time_min"):
        values = sorted(float(item[field]) for item in metrics if item[field] is not None)
        if len(values) < 5:
            continue
        q1, q3 = statistics.quantiles(values, n=4, method="inclusive")[0], statistics.quantiles(values, n=4, method="inclusive")[2]
        iqr = q3 - q1
        if iqr <= 0:
            continue
        low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        for metric in metrics:
            value = metric[field]
            if value is not None and (value < low or value > high):
                metric["outlier_review_flags"].append(f"tukey_1.5_iqr_{field}")


def feature_collection(name: str, features: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "metadata": {**metadata, "output_name": name}, "features": features}


def render_html(path: Path, stops: list[CanonicalSnap], isochrones: list[IsochroneResult], review: list[dict[str, Any]], to_web: Transformer, overwrite: bool, repository_root: Path) -> None:
    by_stop = {item.snap.target.target_id: item for item in stops}
    by_iso = {(item.stop_id, item.duration_min): item for item in isochrones}
    panels: list[str] = []
    for stop_id in sorted(by_stop):
        stop = by_stop[stop_id].snap
        if (stop_id, 10) not in by_iso:
            continue
        iso5, iso10 = by_iso[(stop_id, 5)], by_iso[(stop_id, 10)]
        bounds = iso10.polygon_metric.bounds
        min_x, min_y, max_x, max_y = bounds
        pad = 30.0
        min_x, min_y, max_x, max_y = min_x - pad, min_y - pad, max_x + pad, max_y + pad
        width, height = max(max_x - min_x, 1.0), max(max_y - min_y, 1.0)
        def svg_path(value: Any) -> str:
            parts: list[str] = []
            for line in getattr(value, "geoms", (value,)):
                if line.geom_type != "LineString":
                    continue
                coords = " ".join(f"{x - min_x:.2f},{max_y - y:.2f}" for x, y in line.coords)
                parts.append(f'<polyline points="{coords}" fill="none"/>')
            return "".join(parts)
        def svg_polygon(value: Any) -> str:
            polys = [value] if value.geom_type == "Polygon" else list(value.geoms)
            return "".join(f'<path d="M ' + " L ".join(f"{x - min_x:.2f} {max_y - y:.2f}" for x, y in poly.exterior.coords) + ' Z"/>' for poly in polys)
        origin_x, origin_y = to_web.transform(stop.target.point_web.x, stop.target.point_web.y) if False else (None, None)
        # SVG uses metric coordinates; origin comes from the explicit connector start.
        connector = next(line for line in getattr(iso10.linework_metric, "geoms", (iso10.linework_metric,)) if line.geom_type == "LineString")
        ox, oy = connector.coords[0]
        row = next(item for item in review if item["stop_id"] == stop_id)
        panels.append(
            f'<section><h2>{html.escape(stop.target.display_name or stop_id)}</h2>'
            f'<p>Status: <strong>{row["review_status"]}</strong>; bridge flags: {row["buffer_bridge_pair_count"]}</p>'
            f'<svg viewBox="0 0 {width:.2f} {height:.2f}" role="img" aria-label="5 and 10 minute network isochrone for {html.escape(stop_id)}">'
            f'<g class="ten">{svg_polygon(iso10.polygon_metric)}</g><g class="five">{svg_polygon(iso5.polygon_metric)}</g>'
            f'<g class="network">{svg_path(iso10.linework_metric)}</g><circle cx="{ox-min_x:.2f}" cy="{max_y-oy:.2f}" r="8"/></svg></section>'
        )
    document = """<!doctype html><html><head><meta charset=\"utf-8\"><title>PHASE-04 Isochrone QA</title><style>
body{font-family:system-ui;margin:24px;background:#f8fafc;color:#0f172a}section{display:inline-block;vertical-align:top;width:31%;min-width:360px;margin:1%;background:white;padding:12px;border:1px solid #cbd5e1}svg{width:100%;height:300px;background:#e2e8f0}.network polyline{stroke:#64748b;stroke-width:2}.ten path{fill:#60a5fa;fill-opacity:.28;stroke:#2563eb;stroke-width:2}.five path{fill:#34d399;fill-opacity:.42;stroke:#047857;stroke-width:2}circle{fill:#dc2626;stroke:white;stroke-width:3}</style></head><body><h1>PHASE-04 all-stop network isochrone visual QA</h1><p>Automated artifact: reviewers must record PASS, REVIEW, or FAIL for every stop. Merchant eligibility is not polygon based.</p>""" + "".join(panels) + "</body></html>"
    atomic_write_text(path, document, overwrite, repository_root)


def output_guard(paths: list[Path], lineage: dict[str, str], analysis_version: str, fingerprint: str) -> None:
    for path in paths:
        if not path.exists() or path.suffix.lower() != ".geojson":
            continue
        payload = routing.read_json(path)
        metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
        if metadata.get("analysis_version") != analysis_version or metadata.get("input_hashes") != lineage or metadata.get("method_config_fingerprint") != fingerprint:
            raise ValidationError(f"Refusing same-version overwrite with differing lineage or method fingerprint: {path}")


def run_precompute(
    transit_points: Path, culinary_poi: Path, pedestrian_nodes: Path, pedestrian_edges: Path,
    phase03_stop_snaps: Path, phase03_merchant_snaps: Path, phase03_primary_slice: Path,
    output_root: Path, methodology: Path, analysis_version: str = ANALYSIS_VERSION,
    overwrite: bool = False, repository_root: Path | None = None,
    preserve_manual_review: bool = False,
) -> dict[str, Any]:
    repository_root = (repository_root or Path.cwd()).resolve()
    if analysis_version != ANALYSIS_VERSION:
        raise ValidationError("PHASE-04 requires the approved p0-central-v1 analysis version")
    inputs = {"transit_points": transit_points.resolve(), "culinary_poi": culinary_poi.resolve(), "pedestrian_nodes": pedestrian_nodes.resolve(), "pedestrian_edges": pedestrian_edges.resolve()}
    evidence = [phase03_stop_snaps.resolve(), phase03_merchant_snaps.resolve(), phase03_primary_slice.resolve()]
    if any(not path.is_file() for path in [*inputs.values(), *evidence]):
        raise ValidationError("Required canonical inputs or Phase-03 evidence is missing")
    hashes_before = {relative_source_path(path, repository_root): sha256_file(path) for path in inputs.values()}
    config, fingerprint = config_fingerprint()
    processed_root = output_root.resolve() / "processed" / "p0"
    interim_root = output_root.resolve() / "interim" / "p0"
    targets = [processed_root / value for value in OUTPUT_FILENAMES.values()]
    if overwrite:
        output_guard(targets, hashes_before, analysis_version, fingerprint)
    stops_raw = sorted(routing.load_targets(inputs["transit_points"], "canonical stops", "transit_points_p0", "stop_id", "stop_name", analysis_version, 9), key=lambda item: item.target_id)
    merchants_raw = sorted(routing.load_targets(inputs["culinary_poi"], "canonical merchants", "culinary_poi_p0", "merchant_id", "merchant_name", analysis_version), key=lambda item: item.target_id)
    nodes = routing.load_nodes(inputs["pedestrian_nodes"], analysis_version)
    graph, pairs = routing.load_graph(inputs["pedestrian_edges"], nodes, analysis_version)
    transformer = Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True)
    to_web = Transformer.from_crs(METRIC_CRS, WEB_CRS, always_xy=True)
    raw_stops = [routing.snap_target(item, nodes, transformer, STOP_THRESHOLD_M) for item in stops_raw]
    raw_merchants = [routing.snap_target(item, nodes, transformer, MERCHANT_THRESHOLD_M) for item in merchants_raw]
    merchant_components = {item.component_id for item in raw_merchants if acceptance_status(item) == "accepted" and item.component_id}
    stop_components = {item.component_id for item in raw_stops if acceptance_status(item) == "accepted" and item.component_id}
    stops = canonicalize_snaps(raw_stops, merchant_components)
    merchants = canonicalize_snaps(raw_merchants, stop_components)
    all_edges = sorted({edge.edge_id: edge for values in pairs.values() for edge in values}.values(), key=lambda item: item.edge_id)
    access: list[dict[str, Any]] = []
    dijkstra: dict[str, tuple[dict[str, float], dict[str, list[str]]]] = {}
    for stop in stops:
        if stop.routing_status == "routable":
            assert stop.snap.node_id is not None
            dijkstra[stop.snap.target.target_id] = nx.single_source_dijkstra(graph, stop.snap.node_id, weight="length_m")
        for merchant in merchants:
            distances, paths = dijkstra.get(stop.snap.target.target_id, (None, None))
            access.append(pair_record(stop, merchant, distances, paths, analysis_version))
    access.sort(key=lambda feature: (feature["properties"]["stop_id"], feature["properties"]["merchant_id"], analysis_version))
    require_phase03_match(phase03_stop_snaps, phase03_merchant_snaps, phase03_primary_slice, stops, merchants, access)
    isochrones: list[IsochroneResult] = []
    for stop in stops:
        if stop.routing_status != "routable":
            continue
        distances, _ = dijkstra[stop.snap.target.target_id]
        five = build_isochrone(stop, 300, distances, nodes, all_edges, transformer)
        ten = build_isochrone(stop, 600, distances, nodes, all_edges, transformer)
        excess, tolerance = metric_nesting_excess_m2(five.polygon_metric, ten.polygon_metric)
        if excess > tolerance:
            raise ValidationError(f"5-minute isochrone is not nested within 10-minute isochrone for {stop.snap.target.target_id}")
        isochrones.extend((five, ten))
    metrics = per_stop_metrics(access)
    add_outlier_flags(metrics)
    metadata = {"analysis_version": analysis_version, "output_crs": WEB_CRS, "metric_crs": METRIC_CRS, "input_hashes": hashes_before, "method": ISOCHRONE_METHOD, "method_config": config, "method_config_fingerprint": fingerprint}
    stop_collection = feature_collection("stop_snaps_p0", [snap_feature(item, "stop", analysis_version, hashes_before, fingerprint) for item in stops], metadata)
    merchant_collection = feature_collection("merchant_snaps_p0", [snap_feature(item, "merchant", analysis_version, hashes_before, fingerprint) for item in merchants], metadata)
    access_collection = feature_collection("stop_merchant_access", access, metadata)
    iso_features: list[dict[str, Any]] = []
    for item in sorted(isochrones, key=lambda value: (value.stop_id, value.duration_min)):
        geometry_web = geometry_transform(to_web.transform, item.polygon_metric)
        iso_features.append({"type": "Feature", "geometry": mapping(geometry_web), "properties": {**metadata, "stop_id": item.stop_id, "duration_min": item.duration_min, "duration_seconds": item.duration_seconds, "method": ISOCHRONE_METHOD, "isochrone_buffer_m": ISOCHRONE_BUFFER_M, "buffer_bridge_pair_count": len(item.bridge_pairs)}})
    iso_collection = feature_collection("stop_isochrones", iso_features, metadata)
    overlay: list[dict[str, Any]] = []
    for item in isochrones:
        overlay.append({"type": "Feature", "geometry": mapping(geometry_transform(to_web.transform, item.polygon_metric)), "properties": {"artifact_role": "isochrone", "stop_id": item.stop_id, "duration_min": item.duration_min, "analysis_version": analysis_version}})
        overlay.append({"type": "Feature", "geometry": mapping(geometry_transform(to_web.transform, item.linework_metric)), "properties": {"artifact_role": "reachable_network_linework", "stop_id": item.stop_id, "duration_min": item.duration_min, "analysis_version": analysis_version}})
    for edge in all_edges:
        overlay.append({"type": "Feature", "geometry": mapping(edge.geometry_web), "properties": {"artifact_role": "walking_proxy_network", "edge_id": edge.edge_id, "analysis_version": analysis_version}})
    review = []
    for stop in stops:
        bridge_count = sum(len(item.bridge_pairs) for item in isochrones if item.stop_id == stop.snap.target.target_id)
        related = next((metric for metric in metrics if metric["stop_id"] == stop.snap.target.target_id), None)
        review.append({"stop_id": stop.snap.target.target_id, "stop_name": stop.snap.target.display_name, "review_status": "REVIEW", "primary_demo_stop": stop.snap.target.target_id == routing.PRIMARY_STOP_ID, "buffer_bridge_pair_count": bridge_count, "automatic_flags": (related or {}).get("outlier_review_flags", []), "review_notes": None})
    review.sort(key=lambda item: item["stop_id"])
    overlay_collection = feature_collection("phase04_isochrone_validation", overlay, {**metadata, "artifact_scope": "PHASE-04 visual validation evidence; manual review required"})
    outputs = {"stop_snaps": processed_root / OUTPUT_FILENAMES["stop_snaps"], "merchant_snaps": processed_root / OUTPUT_FILENAMES["merchant_snaps"], "access": processed_root / OUTPUT_FILENAMES["access"], "isochrones": processed_root / OUTPUT_FILENAMES["isochrones"], "overlay": interim_root / INTERIM_FILENAMES["overlay"], "html": interim_root / INTERIM_FILENAMES["html"], "review": interim_root / INTERIM_FILENAMES["review"]}
    atomic_write_json(outputs["stop_snaps"], stop_collection, overwrite, repository_root)
    atomic_write_json(outputs["merchant_snaps"], merchant_collection, overwrite, repository_root)
    atomic_write_json(outputs["access"], access_collection, overwrite, repository_root)
    atomic_write_json(outputs["isochrones"], iso_collection, overwrite, repository_root)
    atomic_write_json(outputs["overlay"], overlay_collection, overwrite, repository_root)
    if not preserve_manual_review:
        atomic_write_json(outputs["review"], {"analysis_version": analysis_version, "method_config_fingerprint": fingerprint, "review_status": "manual-review-required", "stops": review}, overwrite, repository_root)
    render_html(outputs["html"], stops, isochrones, review, to_web, overwrite, repository_root)
    summary_rows = "\n".join(f"| {item['stop_id']} | {item['routable_merchant_count']} | {item['reachable_5min_count']} | {item['reachable_10min_count']} | {item['median_reachable_10min_walking_time_min'] if item['median_reachable_10min_walking_time_min'] is not None else 'null'} | {item['unroutable_merchant_count']} | {', '.join(item['outlier_review_flags']) or 'none'} |" for item in metrics)
    methodology_text = f"""# P0 Routing Output Summary\n\n## PHASE-04 contract\n\nAnalysis version: `{analysis_version}`. Frozen snap thresholds: stop `{STOP_THRESHOLD_M:g} m`, merchant `{MERCHANT_THRESHOLD_M:g} m`; walking speed `{WALKING_SPEED_MPS:g} m/s`. Merchant eligibility is determined only from connector-inclusive Dijkstra time, unrounded at 300/600 seconds.\n\n## Isochrone method\n\nMethod: `{ISOCHRONE_METHOD}`. For each undirected edge, the source and target reachable prefixes are unioned; two disjoint partial intervals are preserved. The physical stop connector is included in source linework and consumes its distance budget. `isochrone_buffer_m = {ISOCHRONE_BUFFER_M:g}` is a visual envelope only. Fingerprint: `{fingerprint}`.\n\n## Per-stop metrics\n\n| stop_id | routable merchants | <=5 min | <=10 min | median <=10-min walking time (min) | unroutable | review flags |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |\n{summary_rows}\n\n## Visual QA\n\n`data/interim/p0/phase04_isochrone_validation.html` and its GeoJSON overlay show every P0 stop, both isochrones, explicit connector, and network context. `phase04_isochrone_visual_review.json` requires a human PASS/REVIEW/FAIL record per stop; automated generation does not claim PASS.\n"""
    if not preserve_manual_review:
        atomic_write_text(methodology, methodology_text, overwrite, repository_root)
    hashes_after = {relative_source_path(path, repository_root): sha256_file(path) for path in inputs.values()}
    if hashes_before != hashes_after:
        raise ValidationError("Canonical upstream input changed during PHASE-04")
    return {"analysis_version": analysis_version, "method_config_fingerprint": fingerprint, "metrics": metrics, "manual_review_required": True, "outputs": {name: relative_source_path(path, repository_root) for name, path in outputs.items()}}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transit-points", type=Path, required=True)
    parser.add_argument("--culinary-poi", type=Path, required=True)
    parser.add_argument("--pedestrian-nodes", type=Path, required=True)
    parser.add_argument("--pedestrian-edges", type=Path, required=True)
    parser.add_argument("--phase03-stop-snaps", type=Path, required=True)
    parser.add_argument("--phase03-merchant-snaps", type=Path, required=True)
    parser.add_argument("--phase03-primary-slice", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--methodology", type=Path, required=True)
    parser.add_argument("--analysis-version", default=ANALYSIS_VERSION)
    parser.add_argument("--isochrone-method", default=ISOCHRONE_METHOD)
    parser.add_argument("--isochrone-buffer-m", type=float, default=ISOCHRONE_BUFFER_M)
    parser.add_argument("--preserve-manual-review", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.isochrone_method != ISOCHRONE_METHOD or not math.isclose(args.isochrone_buffer_m, ISOCHRONE_BUFFER_M):
        print("PHASE-04 failed: method/config differs from frozen implementation", file=sys.stderr)
        return 1
    try:
        result = run_precompute(args.transit_points, args.culinary_poi, args.pedestrian_nodes, args.pedestrian_edges, args.phase03_stop_snaps, args.phase03_merchant_snaps, args.phase03_primary_slice, args.output_root, args.methodology, args.analysis_version, args.overwrite, Path.cwd(), args.preserve_manual_review)
    except ValidationError as exc:
        print(f"PHASE-04 failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
