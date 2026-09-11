#!/usr/bin/env python
"""Validate P0 nearest-node snaps and a Simpang Dukuh Dijkstra vertical slice.

This is a PHASE-03 validation tool.  It writes only labelled evidence below a
validation root (normally ``data/interim/p0``); it deliberately cannot write
the PHASE-04 canonical processed snap paths.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, Point, mapping, shape

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


PRIMARY_STOP_ID = "6a92c77152d86e03b51db962"
STOP_THRESHOLD_M = 30.0
MERCHANT_THRESHOLD_M = 50.0
WALKING_SPEED_MPS = 1.3
INTERIM_FILENAMES = {
    "stops": "phase03_stop_snaps_baseline.geojson",
    "merchants": "phase03_merchant_snaps_baseline.geojson",
    "summary": "phase03_snapping_summary.json",
    "slice": "phase03_halte_simpang_dukuh_vertical_slice.json",
    "cases": "phase03_halte_simpang_dukuh_validation_cases.geojson",
    "html": "phase03_halte_simpang_dukuh_validation.html",
}


@dataclass(frozen=True)
class Node:
    node_id: str
    x_m: float
    y_m: float
    component_id: str
    point_web: Point


@dataclass(frozen=True)
class Edge:
    edge_id: str
    source_node: str
    target_node: str
    length_m: float
    geometry_web: LineString


@dataclass(frozen=True)
class Target:
    target_id: str
    display_name: str | None
    point_web: Point | None
    original_feature: dict[str, Any]


@dataclass(frozen=True)
class Snap:
    target: Target
    node_id: str | None
    snap_distance_m: float | None
    component_id: str | None
    routing_status: str
    threshold_m: float


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Cannot read JSON from {path}: {exc}") from exc


def finite_number(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label} is not numeric") from exc
    if not math.isfinite(number):
        raise ValidationError(f"{label} is not finite")
    return number


def collection(payload: Any, label: str, expected_name: str, analysis_version: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValidationError(f"{label} must be a GeoJSON FeatureCollection")
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise ValidationError(f"{label} has no metadata object")
    if metadata.get("output_name") != expected_name:
        raise ValidationError(f"{label} output_name must be {expected_name}")
    if metadata.get("output_crs") != WEB_CRS or metadata.get("analysis_version") != analysis_version:
        raise ValidationError(f"{label} CRS or analysis_version differs from requested validation")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise ValidationError(f"{label} must have nonempty features")
    return features


def optional_point(geometry: Any) -> Point | None:
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return None
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return None
    try:
        x, y = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x) or not math.isfinite(y) or not -180 <= x <= 180 or not -90 <= y <= 90:
        return None
    point = Point(x, y)
    return point if point.is_valid and not point.is_empty else None


def load_targets(
    path: Path, label: str, expected_name: str, id_key: str, name_key: str, analysis_version: str,
    exact_count: int | None = None,
) -> list[Target]:
    features = collection(read_json(path), label, expected_name, analysis_version)
    if exact_count is not None and len(features) != exact_count:
        raise ValidationError(f"{label} must contain exactly {exact_count} features")
    targets: list[Target] = []
    seen: set[str] = set()
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValidationError(f"{label} feature {index} is not a GeoJSON Feature")
        props = feature.get("properties")
        if not isinstance(props, dict) or not isinstance(props.get(id_key), str) or not props[id_key]:
            raise ValidationError(f"{label} feature {index} has invalid {id_key}")
        target_id = props[id_key]
        if target_id in seen:
            raise ValidationError(f"{label} has duplicate {id_key}: {target_id}")
        seen.add(target_id)
        name = props.get(name_key)
        targets.append(Target(target_id, name if isinstance(name, str) else None, optional_point(feature.get("geometry")), feature))
    return targets


def load_nodes(path: Path, analysis_version: str) -> dict[str, Node]:
    features = collection(read_json(path), "pedestrian nodes", "pedestrian_nodes", analysis_version)
    payload = read_json(path)
    metadata = payload["metadata"]
    if metadata.get("metric_crs") != METRIC_CRS or metadata.get("graph_type") != "undirected_multigraph":
        raise ValidationError("Pedestrian nodes do not declare the frozen graph contract")
    transformer = Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True)
    nodes: dict[str, Node] = {}
    for index, feature in enumerate(features):
        props = feature.get("properties")
        if not isinstance(props, dict) or not isinstance(props.get("node_id"), str) or not isinstance(props.get("component_id"), str):
            raise ValidationError(f"Node feature {index} lacks node/component ID")
        if props["node_id"] in nodes:
            raise ValidationError(f"Duplicate graph node ID: {props['node_id']}")
        point = optional_point(feature.get("geometry"))
        if point is None:
            raise ValidationError(f"Node feature {index} geometry is not a valid Point")
        x_m, y_m = finite_number(props.get("x_m"), "node x_m"), finite_number(props.get("y_m"), "node y_m")
        check_x, check_y = transformer.transform(point.x, point.y)
        if not math.isclose(x_m, check_x, abs_tol=0.02) or not math.isclose(y_m, check_y, abs_tol=0.02):
            raise ValidationError(f"Node {props['node_id']} metric coordinates disagree with geometry")
        nodes[props["node_id"]] = Node(props["node_id"], x_m, y_m, props["component_id"], point)
    return nodes


def load_graph(path: Path, nodes: dict[str, Node], analysis_version: str) -> tuple[nx.MultiGraph, dict[tuple[str, str], list[Edge]]]:
    payload = read_json(path)
    features = collection(payload, "pedestrian edges", "pedestrian_edges", analysis_version)
    metadata = payload["metadata"]
    if metadata.get("metric_crs") != METRIC_CRS or metadata.get("graph_type") != "undirected_multigraph":
        raise ValidationError("Pedestrian edges do not declare the frozen graph contract")
    graph = nx.MultiGraph()
    for node_id in sorted(nodes):
        graph.add_node(node_id)
    pairs: dict[tuple[str, str], list[Edge]] = defaultdict(list)
    seen: set[str] = set()
    records: list[Edge] = []
    for index, feature in enumerate(features):
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise ValidationError(f"Edge feature {index} has no properties")
        edge_id, source, target = props.get("edge_id"), props.get("source_node"), props.get("target_node")
        if not all(isinstance(item, str) and item for item in (edge_id, source, target)):
            raise ValidationError(f"Edge feature {index} lacks IDs")
        if edge_id in seen or source not in nodes or target not in nodes or source >= target:
            raise ValidationError(f"Edge feature {index} has duplicate/invalid endpoints")
        seen.add(edge_id)
        length = finite_number(props.get("length_m"), f"edge {edge_id} length_m")
        cost = finite_number(props.get("cost_seconds"), f"edge {edge_id} cost_seconds")
        if length <= 0 or cost <= 0 or not math.isclose(cost, length / WALKING_SPEED_MPS, rel_tol=1e-12, abs_tol=1e-12):
            raise ValidationError(f"Edge {edge_id} violates frozen positive walking cost")
        try:
            geometry = shape(feature.get("geometry"))
        except Exception as exc:
            raise ValidationError(f"Edge {edge_id} geometry cannot be read") from exc
        if geometry.geom_type != "LineString" or geometry.is_empty or not geometry.is_valid:
            raise ValidationError(f"Edge {edge_id} geometry is invalid")
        records.append(Edge(edge_id, source, target, length, geometry))
    for edge in sorted(records, key=lambda item: (item.source_node, item.target_node, item.edge_id)):
        graph.add_edge(edge.source_node, edge.target_node, key=edge.edge_id, length_m=edge.length_m, edge_id=edge.edge_id)
        pairs[tuple(sorted((edge.source_node, edge.target_node)))].append(edge)
    for values in pairs.values():
        values.sort(key=lambda item: (item.length_m, item.edge_id))
    if graph.number_of_edges() == 0:
        raise ValidationError("Pedestrian graph has no edges")
    loaded_components = {frozenset(part) for part in nx.connected_components(graph)}
    labelled_components: dict[str, set[str]] = defaultdict(set)
    for node in nodes.values():
        labelled_components[node.component_id].add(node.node_id)
    if loaded_components != {frozenset(part) for part in labelled_components.values()}:
        raise ValidationError("Node component metadata differs from loaded graph")
    return graph, pairs


def snap_target(target: Target, nodes: dict[str, Node], transformer: Transformer, threshold_m: float) -> Snap:
    if target.point_web is None:
        return Snap(target, None, None, None, "invalid_geometry", threshold_m)
    x_m, y_m = transformer.transform(target.point_web.x, target.point_web.y)
    candidate = min(
        ((math.hypot(node.x_m - x_m, node.y_m - y_m), node.node_id, node) for node in nodes.values()),
        key=lambda item: (item[0], item[1]),
    )
    distance, node_id, node = candidate
    status = "routable" if distance <= threshold_m else "snap_too_far"
    return Snap(target, node_id, distance, node.component_id, status, threshold_m)


def snap_feature(snap: Snap, analysis_version: str, kind: str, lineage: dict[str, str]) -> dict[str, Any]:
    props = {
        "analysis_version": analysis_version,
        "entity_type": kind,
        f"{kind}_id": snap.target.target_id,
        f"{kind}_name": snap.target.display_name,
        "node_id": snap.node_id,
        "snap_distance_m": snap.snap_distance_m,
        "component_id": snap.component_id,
        "routing_status": snap.routing_status,
        "threshold_m": snap.threshold_m,
        "input_lineage": lineage,
    }
    return {"type": "Feature", "geometry": mapping(snap.target.point_web) if snap.target.point_web else None, "properties": props}


def route_record(
    merchant: Snap, primary: Snap, distances: dict[str, float], paths: dict[str, list[str]],
) -> dict[str, Any]:
    base = {
        "merchant_id": merchant.target.target_id,
        "merchant_name": merchant.target.display_name,
        "merchant_node_id": merchant.node_id,
        "merchant_snap_distance_m": merchant.snap_distance_m,
        "merchant_component_id": merchant.component_id,
        "routing_status": merchant.routing_status,
        "primary_route_status": None,
        "graph_shortest_path_distance_m": None,
        "total_distance_m": None,
        "walking_time_seconds": None,
        "walking_time_min": None,
        "walking_band": None,
        "path_node_ids": [],
    }
    if merchant.routing_status != "routable":
        return base
    assert merchant.node_id is not None and merchant.component_id is not None
    assert primary.node_id is not None and primary.snap_distance_m is not None
    if merchant.component_id != primary.component_id:
        return {**base, "primary_route_status": "disconnected"}
    if merchant.node_id not in distances or merchant.node_id not in paths:
        raise ValidationError(f"Accepted same-component merchant {merchant.target.target_id} is absent from Dijkstra")
    graph_distance = distances[merchant.node_id]
    total = primary.snap_distance_m + graph_distance + (merchant.snap_distance_m or 0.0)
    seconds = total / WALKING_SPEED_MPS
    band = "<=300" if seconds <= 300 else "301-600" if seconds <= 600 else ">600"
    return {
        **base,
        "primary_route_status": "routable",
        "graph_shortest_path_distance_m": graph_distance,
        "total_distance_m": total,
        "walking_time_seconds": seconds,
        "walking_time_min": seconds / 60,
        "walking_band": band,
        "path_node_ids": paths[merchant.node_id],
    }


def choose_cases(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    routable = [item for item in records if item["primary_route_status"] == "routable" and item["walking_time_seconds"] is not None]
    selected: list[dict[str, Any]] = []
    rules: list[tuple[str, Iterable[dict[str, Any]]]] = [
        ("lowest_nonzero_route", [item for item in routable if item["walking_time_seconds"] > 0]),
        ("nearest_at_or_under_300_seconds", [item for item in routable if item["walking_time_seconds"] <= 300]),
        ("nearest_over_300_seconds", [item for item in routable if item["walking_time_seconds"] > 300]),
        ("nearest_450_seconds", [item for item in routable if 300 < item["walking_time_seconds"] <= 600]),
        ("smallest_over_600_seconds", [item for item in routable if item["walking_time_seconds"] > 600]),
    ]
    for rule, candidates in rules:
        candidates = list(candidates)
        if not candidates:
            continue
        if rule == "lowest_nonzero_route" or rule == "smallest_over_600_seconds":
            choice = min(candidates, key=lambda item: (item["walking_time_seconds"], item["merchant_id"]))
        elif rule == "nearest_450_seconds":
            choice = min(candidates, key=lambda item: (abs(item["walking_time_seconds"] - 450), item["merchant_id"]))
        else:
            boundary = 300
            choice = min(candidates, key=lambda item: (abs(item["walking_time_seconds"] - boundary), item["merchant_id"]))
        if choice["merchant_id"] not in {item["merchant_id"] for item in selected}:
            selected.append({**choice, "selection_rule": rule, "manual_review_status": "pending", "manual_observed_route_behavior": None, "manual_notes": None})
    for status in ("snap_too_far", "invalid_geometry", "disconnected"):
        candidates = [item for item in records if (item["routing_status"] == status or item["primary_route_status"] == status)]
        if candidates:
            choice = min(candidates, key=lambda item: item["merchant_id"])
            if choice["merchant_id"] not in {item["merchant_id"] for item in selected}:
                selected.append({**choice, "selection_rule": f"status_{status}", "manual_review_status": "pending", "manual_observed_route_behavior": None, "manual_notes": None})
    for item in sorted(routable, key=lambda value: (value["walking_time_seconds"], value["merchant_id"])):
        if len(selected) >= 5:
            break
        if item["merchant_id"] not in {value["merchant_id"] for value in selected}:
            selected.append({**item, "selection_rule": "deterministic_time_quantile_fallback", "manual_review_status": "pending", "manual_observed_route_behavior": None, "manual_notes": None})
    return selected[:10]


def route_geometry(path_nodes: list[str], pairs: dict[tuple[str, str], list[Edge]]) -> tuple[list[LineString], float]:
    lines: list[LineString] = []
    length = 0.0
    for source, target in zip(path_nodes, path_nodes[1:]):
        candidates = pairs.get(tuple(sorted((source, target))), [])
        if not candidates:
            raise ValidationError(f"Dijkstra path pair {source}/{target} has no edge")
        edge = candidates[0]
        coords = list(edge.geometry_web.coords)
        if edge.source_node != source:
            coords.reverse()
        lines.append(LineString(coords))
        length += edge.length_m
    return lines, length


def case_features(
    cases: list[dict[str, Any]], primary: Snap, merchant_by_id: dict[str, Snap], nodes: dict[str, Node],
    pairs: dict[tuple[str, str], list[Edge]], distances: dict[str, float], analysis_version: str,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    assert primary.target.point_web is not None and primary.node_id is not None
    features.append({"type": "Feature", "geometry": mapping(primary.target.point_web), "properties": {"artifact_role": "canonical_stop", "analysis_version": analysis_version, "stop_id": primary.target.target_id}})
    primary_node = nodes[primary.node_id]
    features.append({"type": "Feature", "geometry": mapping(primary_node.point_web), "properties": {"artifact_role": "stop_snapped_node", "analysis_version": analysis_version, "stop_id": primary.target.target_id}})
    features.append({"type": "Feature", "geometry": mapping(LineString((primary.target.point_web, primary_node.point_web))), "properties": {"artifact_role": "stop_snap_connector", "analysis_version": analysis_version, "distance_m": primary.snap_distance_m}})
    # Network context is visual evidence only.  It is deliberately distinct
    # from selected route edges and is never used to replace Dijkstra output.
    context_edges = {edge.edge_id: edge for edges in pairs.values() for edge in edges}
    for edge in sorted(context_edges.values(), key=lambda item: item.edge_id):
        features.append({"type": "Feature", "geometry": mapping(edge.geometry_web), "properties": {"artifact_role": "network_context", "analysis_version": analysis_version, "edge_id": edge.edge_id}})
    for case in cases:
        merchant = merchant_by_id[case["merchant_id"]]
        if merchant.target.point_web is not None:
            features.append({"type": "Feature", "geometry": mapping(merchant.target.point_web), "properties": {"artifact_role": "canonical_merchant", "analysis_version": analysis_version, "merchant_id": merchant.target.target_id, "selection_rule": case["selection_rule"]}})
        if merchant.node_id is not None:
            node = nodes[merchant.node_id]
            features.append({"type": "Feature", "geometry": mapping(node.point_web), "properties": {"artifact_role": "merchant_snapped_node", "analysis_version": analysis_version, "merchant_id": merchant.target.target_id}})
            if merchant.target.point_web is not None:
                features.append({"type": "Feature", "geometry": mapping(LineString((merchant.target.point_web, node.point_web))), "properties": {"artifact_role": "merchant_snap_connector", "analysis_version": analysis_version, "merchant_id": merchant.target.target_id, "distance_m": merchant.snap_distance_m}})
        if case["primary_route_status"] == "routable":
            lines, sum_length = route_geometry(case["path_node_ids"], pairs)
            if not math.isclose(sum_length, distances[merchant.node_id], abs_tol=0.001):
                raise ValidationError(f"Path reconstruction differs from NetworkX distance for {merchant.target.target_id}")
            for position, line in enumerate(lines):
                features.append({"type": "Feature", "geometry": mapping(line), "properties": {"artifact_role": "graph_route", "analysis_version": analysis_version, "merchant_id": merchant.target.target_id, "route_order": position}})
    return features


def render_html(path: Path, case_collection: dict[str, Any], cases: list[dict[str, Any]], overwrite: bool, repository_root: Path) -> None:
    geometries = [shape(feature["geometry"]) for feature in case_collection["features"] if feature.get("geometry")]
    if not geometries:
        raise ValidationError("No visual validation geometry was generated")
    min_x = min(geometry.bounds[0] for geometry in geometries)
    min_y = min(geometry.bounds[1] for geometry in geometries)
    max_x = max(geometry.bounds[2] for geometry in geometries)
    max_y = max(geometry.bounds[3] for geometry in geometries)
    pad_x, pad_y = max((max_x - min_x) * 0.08, 0.0002), max((max_y - min_y) * 0.08, 0.0002)
    min_x, min_y, max_x, max_y = min_x - pad_x, min_y - pad_y, max_x + pad_x, max_y + pad_y
    width, height = max_x - min_x, max_y - min_y
    def point_markup(point: Point, color: str, radius: float) -> str:
        return f'<circle cx="{point.x - min_x:.7f}" cy="{max_y - point.y:.7f}" r="{radius}" fill="{color}" />'
    paths: list[str] = []
    dots: list[str] = []
    colors = {"network_context": "#cbd5e1", "graph_route": "#0f766e", "stop_snap_connector": "#e11d48", "merchant_snap_connector": "#f59e0b"}
    for feature in case_collection["features"]:
        geometry = feature.get("geometry")
        role = feature["properties"]["artifact_role"]
        if not geometry:
            continue
        value = shape(geometry)
        if value.geom_type == "LineString":
            coords = " ".join(f"{x - min_x:.7f},{max_y - y:.7f}" for x, y in value.coords)
            stroke_width = "0.000006" if role == "network_context" else "0.000018"
            paths.append(f'<polyline points="{coords}" fill="none" stroke="{colors.get(role, "#94a3b8")}" stroke-width="{stroke_width}" />')
        elif value.geom_type == "Point":
            dots.append(point_markup(value, "#dc2626" if role == "canonical_stop" else "#2563eb" if role == "canonical_merchant" else "#111827", 0.000045))
    rows = "".join(
        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{:.2f}</td><td>pending</td></tr>".format(
            html.escape(str(case["selection_rule"])), html.escape(str(case["merchant_name"] or case["merchant_id"])),
            html.escape(str(case["primary_route_status"])), float(case["walking_time_min"] or 0.0),
        ) for case in cases
    )
    document = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>PHASE-03 Simpang Dukuh validation</title>
<style>body{{font:14px system-ui,sans-serif;margin:24px;color:#111827}}svg{{width:min(100%,1100px);height:680px;border:1px solid #cbd5e1;background:#f8fafc}}table{{border-collapse:collapse;margin-top:16px}}td,th{{border:1px solid #cbd5e1;padding:6px;text-align:left}}.note{{color:#475569}}</style></head><body>
<h1>PHASE-03 Simpang Dukuh spatial-validation evidence</h1><p class=\"note\">Interim evidence only; connectors are diagnostic and are included in distance/time. Green = Dijkstra graph route; pink/orange = snap connectors; red = source stop; blue = merchant.</p>
<svg viewBox=\"0 0 {width:.7f} {height:.7f}\" role=\"img\" aria-label=\"Selected Simpang Dukuh routing validation cases\">{''.join(paths)}{''.join(dots)}</svg>
<table><thead><tr><th>Selection</th><th>Merchant</th><th>Primary relationship</th><th>Minutes</th><th>Manual review</th></tr></thead><tbody>{rows}</tbody></table>
<p class=\"note\">A human/Codex reviewer must record observed route behavior, spatial plausibility, and notes in the methodology/report. This page does not auto-approve a case.</p></body></html>"""
    atomic_write_text(path, document, overwrite, repository_root)


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    low, high = math.floor(index), math.ceil(index)
    return ordered[low] if low == high else ordered[low] + (ordered[high] - ordered[low]) * (index - low)


def distribution(snaps: list[Snap]) -> dict[str, Any]:
    values = [snap.snap_distance_m for snap in snaps if snap.snap_distance_m is not None]
    return {
        "count": len(snaps), "valid_geometry_count": len(values), "min_m": min(values) if values else None,
        "median_m": statistics.median(values) if values else None, "p90_m": percentile(values, 0.90),
        "p95_m": percentile(values, 0.95), "max_m": max(values) if values else None,
        "at_or_under_25_m": sum(value <= 25 for value in values), "at_or_under_threshold": sum(value <= snaps[0].threshold_m for value in values) if snaps else 0,
        "over_threshold": sum(value > snaps[0].threshold_m for value in values) if snaps else 0,
        "status_counts": dict(sorted(Counter(snap.routing_status for snap in snaps).items())),
        "component_distribution": dict(sorted(Counter(snap.component_id for snap in snaps if snap.component_id).items())),
    }


def ensure_interim_root(root: Path, repository_root: Path) -> Path:
    resolved, repository = root.resolve(), repository_root.resolve()
    processed = (repository / "data" / "processed").resolve()
    if processed == resolved or processed in resolved.parents or not (repository / "data" / "interim").resolve() in (resolved, *resolved.parents):
        raise ValidationError("PHASE-03 validation root must be under data/interim and never data/processed")
    return resolved


def phase03_readiness_state(threshold_state: str, manual_spatial_review_complete: bool = False) -> str:
    """Return the gate state without allowing a threshold proposal to bypass PHASE-03.

    ``final-threshold-rerun`` is the only post-change state that can become
    ready, and only after its manual spatial review is completed.  The command
    line deliberately never marks manual review complete; methodology/report
    evidence supplies that human gate.
    """
    if threshold_state == "proposed-change":
        return "partial-pending-chatgpt-threshold-review"
    if threshold_state not in {"baseline-evaluation", "final-threshold-rerun"}:
        raise ValidationError("threshold_state must be baseline-evaluation, proposed-change, or final-threshold-rerun")
    if not manual_spatial_review_complete:
        return "pending-manual-spatial-review"
    return "ready-for-go-next"


def run_pipeline(
    transit_points: Path, culinary_poi: Path, pedestrian_nodes: Path, pedestrian_edges: Path,
    validation_root: Path, analysis_version: str = ANALYSIS_VERSION, stop_threshold_m: float = STOP_THRESHOLD_M,
    merchant_threshold_m: float = MERCHANT_THRESHOLD_M, threshold_state: str = "baseline-evaluation",
    overwrite: bool = False, repository_root: Path | None = None,
) -> dict[str, Any]:
    repository_root = (repository_root or Path.cwd()).resolve()
    root = ensure_interim_root(validation_root, repository_root)
    if stop_threshold_m <= 0 or merchant_threshold_m <= 0 or not math.isfinite(stop_threshold_m) or not math.isfinite(merchant_threshold_m):
        raise ValidationError("Snap thresholds must be positive finite metres")
    readiness_state = phase03_readiness_state(threshold_state)
    paths = {"transit_points": transit_points.resolve(), "culinary_poi": culinary_poi.resolve(), "pedestrian_nodes": pedestrian_nodes.resolve(), "pedestrian_edges": pedestrian_edges.resolve()}
    if any(not value.is_file() for value in paths.values()):
        raise ValidationError("All four PHASE-01/02 inputs must exist")
    hashes_before = {name: sha256_file(path) for name, path in paths.items()}
    # PHASE-01/02 inputs retain their approved lineage version even when an
    # approved PHASE-03 threshold rerun emits a new analysis version.
    stops = load_targets(paths["transit_points"], "canonical stops", "transit_points_p0", "stop_id", "stop_name", ANALYSIS_VERSION, 9)
    merchants = sorted(load_targets(paths["culinary_poi"], "canonical merchants", "culinary_poi_p0", "merchant_id", "merchant_name", ANALYSIS_VERSION), key=lambda item: item.target_id)
    primary_matches = [target for target in stops if target.target_id == PRIMARY_STOP_ID]
    if len(primary_matches) != 1:
        raise ValidationError("Primary stop must be located by exactly one frozen stop_id")
    nodes = load_nodes(paths["pedestrian_nodes"], ANALYSIS_VERSION)
    graph, pairs = load_graph(paths["pedestrian_edges"], nodes, ANALYSIS_VERSION)
    transformer = Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True)
    stop_snaps = [snap_target(target, nodes, transformer, stop_threshold_m) for target in stops]
    primary = next(snap for snap in stop_snaps if snap.target.target_id == PRIMARY_STOP_ID)
    if primary.routing_status != "routable" or primary.node_id is None:
        raise ValidationError("Primary stop is invalid or exceeds the frozen stop snap threshold")
    merchant_snaps = [snap_target(target, nodes, transformer, merchant_threshold_m) for target in merchants]
    distances, node_paths = nx.single_source_dijkstra(graph, primary.node_id, weight="length_m")
    routes = [route_record(snap, primary, distances, node_paths) for snap in merchant_snaps]
    cases = choose_cases(routes)
    merchant_by_id = {snap.target.target_id: snap for snap in merchant_snaps}
    lineage = {relative_source_path(paths[name], repository_root): digest for name, digest in hashes_before.items()}
    metadata = {"analysis_version": analysis_version, "output_crs": WEB_CRS, "metric_crs": METRIC_CRS, "artifact_scope": "PHASE-03 interim validation evidence; not PHASE-04 canonical output", "threshold_state": threshold_state, "input_hashes": lineage}
    output_paths = {name: root / filename for name, filename in INTERIM_FILENAMES.items()}
    stop_collection = {"type": "FeatureCollection", "metadata": {**metadata, "output_name": "phase03_stop_snaps_baseline"}, "features": [snap_feature(item, analysis_version, "stop", lineage) for item in stop_snaps]}
    merchant_collection = {"type": "FeatureCollection", "metadata": {**metadata, "output_name": "phase03_merchant_snaps_baseline"}, "features": [snap_feature(item, analysis_version, "merchant", lineage) for item in merchant_snaps]}
    case_collection = {"type": "FeatureCollection", "metadata": {**metadata, "output_name": "phase03_halte_simpang_dukuh_validation_cases", "manual_review_status": "pending"}, "features": case_features(cases, primary, merchant_by_id, nodes, pairs, distances, analysis_version)}
    slice_document = {"analysis_version": analysis_version, "artifact_scope": metadata["artifact_scope"], "threshold_state": threshold_state, "primary_stop_id": PRIMARY_STOP_ID, "primary_snap": snap_feature(primary, analysis_version, "stop", lineage)["properties"], "routes": routes, "selected_cases": cases}
    summary = {"analysis_version": analysis_version, "artifact_scope": metadata["artifact_scope"], "threshold_state": threshold_state, "phase03_readiness": readiness_state, "thresholds_m": {"stop": stop_threshold_m, "merchant": merchant_threshold_m}, "input_hashes": lineage, "primary_stop": {"stop_id": PRIMARY_STOP_ID, "node_id": primary.node_id, "snap_distance_m": primary.snap_distance_m, "component_id": primary.component_id}, "stop_distribution": distribution(stop_snaps), "merchant_distribution": distribution(merchant_snaps), "primary_route_status_counts": dict(sorted(Counter(route["primary_route_status"] for route in routes if route["primary_route_status"]).items())), "selected_case_count": len(cases), "manual_spatial_review": "pending; automated output cannot claim plausibility PASS", "percentile_method": "linear interpolation over sorted valid snap distances using index (n-1)*p"}
    atomic_write_json(output_paths["stops"], stop_collection, overwrite, repository_root)
    atomic_write_json(output_paths["merchants"], merchant_collection, overwrite, repository_root)
    atomic_write_json(output_paths["slice"], slice_document, overwrite, repository_root)
    atomic_write_json(output_paths["cases"], case_collection, overwrite, repository_root)
    atomic_write_json(output_paths["summary"], summary, overwrite, repository_root)
    render_html(output_paths["html"], case_collection, cases, overwrite, repository_root)
    hashes_after = {name: sha256_file(path) for name, path in paths.items()}
    if hashes_before != hashes_after:
        raise ValidationError("PHASE-01/02 input hash changed during PHASE-03 validation")
    return {**summary, "outputs": {name: relative_source_path(path, repository_root) for name, path in output_paths.items()}}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transit-points", type=Path, required=True)
    parser.add_argument("--culinary-poi", type=Path, required=True)
    parser.add_argument("--pedestrian-nodes", type=Path, required=True)
    parser.add_argument("--pedestrian-edges", type=Path, required=True)
    parser.add_argument("--validation-root", type=Path, required=True)
    parser.add_argument("--analysis-version", default=ANALYSIS_VERSION)
    parser.add_argument("--stop-threshold-m", type=float, default=STOP_THRESHOLD_M)
    parser.add_argument("--merchant-threshold-m", type=float, default=MERCHANT_THRESHOLD_M)
    parser.add_argument("--threshold-state", choices=("baseline-evaluation", "proposed-change", "final-threshold-rerun"), default="baseline-evaluation")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = run_pipeline(args.transit_points, args.culinary_poi, args.pedestrian_nodes, args.pedestrian_edges, args.validation_root, args.analysis_version, args.stop_threshold_m, args.merchant_threshold_m, args.threshold_state, args.overwrite, Path.cwd())
    except ValidationError as exc:
        print(f"PHASE-03 validation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
