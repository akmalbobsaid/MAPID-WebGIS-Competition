#!/usr/bin/env python
"""Build the deterministic RUJAK P0 walking-network proxy graph offline.

This script deliberately does not snap stops/merchants or compute routes.  It
uses shared source coordinates for topology and never creates graph connections
from crossing, proximity, or clipping alone.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import networkx as nx
from shapely.geometry import LineString, MultiLineString, Point, Polygon, mapping, shape
from shapely.ops import transform

from p0_ingestion import (
    ANALYSIS_VERSION,
    METRIC_CRS,
    P0_STOP_IDS,
    WEB_CRS,
    ValidationError,
    atomic_write_json,
    atomic_write_text,
    display_path,
    read_json,
    relative_source_path,
    sha256_file,
    to_metric,
    to_web,
)


WALKING_SPEED_MPS = 1.3
SOURCE_CRS84 = "urn:ogc:def:crs:OGC:1.3:CRS84"
INCLUDE_HIGHWAYS = frozenset({
    "footway", "pedestrian", "path", "steps", "living_street", "residential",
    "service", "unclassified", "tertiary", "tertiary_link", "secondary",
    "secondary_link", "primary", "primary_link",
})
FROZEN_EXCLUDE_HIGHWAYS = frozenset({
    "motorway", "motorway_link", "trunk", "trunk_link", "raceway", "construction", "proposed",
})
# This records an observed source category. It does not amend the frozen list.
APPROVED_NON_ALLOWLISTED_HIGHWAYS = frozenset({"cycleway"})

NODE_FIELDS = ("node_id", "x_m", "y_m", "component_id")
EDGE_FIELDS = (
    "edge_id", "source_node", "target_node", "osm_id", "highway", "surface", "bridge", "tunnel",
    "layer", "length_m", "cost_seconds", "source_feature_index", "part_index", "segment_index", "oneway",
)


@dataclass(frozen=True)
class NodeRecord:
    node_id: str
    token: str
    x_m: float
    y_m: float
    kind: str


@dataclass(frozen=True)
class EdgeRecord:
    edge_id: str
    source_node: str
    target_node: str
    geometry_metric: LineString
    properties: dict[str, Any]


@dataclass
class GraphResult:
    nodes: dict[str, NodeRecord]
    edges: list[EdgeRecord]
    components: dict[str, str]
    diagnostics: dict[str, Any]
    clipped_context: list[LineString]


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest_id(prefix: str, value: Any) -> str:
    return f"{prefix}_{hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()}"


def finite_coordinate(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label} is not numeric") from exc
    if not math.isfinite(number):
        raise ValidationError(f"{label} is not finite")
    return number


def float_token(value: float) -> str:
    if value == 0:
        value = 0.0
    return float(value).hex()


def coordinate_key(x: float, y: float) -> tuple[str, str]:
    return (float_token(x), float_token(y))


def diagnostic_coordinate_key(x: float, y: float) -> tuple[str, str]:
    """Group only reporting candidates to millimetre precision, never topology."""
    return (format(x, ".3f"), format(y, ".3f"))


def source_coordinate_token(longitude: float, latitude: float) -> str:
    return "source|" + "|".join(coordinate_key(longitude, latitude))


def boundary_coordinate_token(feature_index: int, part_index: int, vertex_index: int, x_m: float, y_m: float) -> str:
    return "boundary|" + "|".join((
        str(feature_index), str(part_index), str(vertex_index), float_token(x_m), float_token(y_m),
    ))


def optional_property(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    return value


def highway_value(properties: dict[str, Any], feature_index: int) -> str:
    value = properties.get("highway")
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"Road feature {feature_index} has null, blank, or malformed highway")
    return value.strip()


def road_crs_is_wgs84(payload: dict[str, Any]) -> bool:
    crs = payload.get("crs")
    if not isinstance(crs, dict) or crs.get("type") != "name":
        return False
    properties = crs.get("properties")
    if not isinstance(properties, dict):
        return False
    name = properties.get("name")
    return name in {SOURCE_CRS84, "EPSG:4326", "urn:ogc:def:crs:EPSG::4326"}


def line_parts(geometry: Any) -> list[LineString]:
    if geometry.is_empty:
        return []
    if geometry.geom_type == "LineString":
        return [geometry]
    if geometry.geom_type in {"MultiLineString", "GeometryCollection"}:
        result: list[LineString] = []
        for member in geometry.geoms:
            result.extend(line_parts(member))
        return result
    return []


def stable_line_key(line: LineString) -> tuple[tuple[str, str], ...]:
    forward = tuple(coordinate_key(x, y) for x, y, *_ in line.coords)
    return min(forward, tuple(reversed(forward)))


def validate_road_source(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValidationError("Road source must be a GeoJSON FeatureCollection")
    if not road_crs_is_wgs84(payload):
        raise ValidationError("Road source CRS must explicitly be CRS84/EPSG:4326 longitude-latitude")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise ValidationError("Road source must contain features")
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValidationError(f"Road feature {index} is not a GeoJSON Feature")
        if not isinstance(feature.get("properties"), dict):
            raise ValidationError(f"Road feature {index} must have properties")
        highway_value(feature["properties"], index)
        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            raise ValidationError(f"Road feature {index} has no geometry")
        geometry = shape(geometry_payload)
        if geometry.geom_type not in {"LineString", "MultiLineString"}:
            raise ValidationError(f"Road feature {index} must be LineString or MultiLineString")
        if geometry.is_empty or not geometry.is_valid:
            raise ValidationError(f"Road feature {index} has invalid or empty geometry")
    return features


def validate_phase1_area(payload: Any, label: str, expected_property: str | None = None) -> Any:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValidationError(f"{label} must be a FeatureCollection")
    if payload.get("metadata", {}).get("output_crs") != WEB_CRS:
        raise ValidationError(f"{label} output CRS must be {WEB_CRS}")
    features = payload.get("features")
    if not isinstance(features, list) or len(features) != 1:
        raise ValidationError(f"{label} must contain exactly one feature")
    feature = features[0]
    properties = feature.get("properties")
    if not isinstance(properties, dict) or properties.get("analysis_version") != ANALYSIS_VERSION:
        raise ValidationError(f"{label} analysis_version must be {ANALYSIS_VERSION}")
    if expected_property and expected_property not in properties:
        raise ValidationError(f"{label} is missing {expected_property}")
    geometry = shape(feature.get("geometry"))
    if geometry.geom_type not in {"Polygon", "MultiPolygon"} or geometry.is_empty or not geometry.is_valid:
        raise ValidationError(f"{label} must have one valid polygon geometry")
    return geometry


def validate_transit_points(payload: Any) -> list[tuple[str, str, Point]]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValidationError("transit_points_p0 must be a FeatureCollection")
    if payload.get("metadata", {}).get("output_crs") != WEB_CRS:
        raise ValidationError("transit_points_p0 output CRS must be EPSG:4326")
    features = payload.get("features")
    if not isinstance(features, list) or len(features) != len(P0_STOP_IDS):
        raise ValidationError("transit_points_p0 must contain exactly nine canonical stops")
    stops: list[tuple[str, str, Point]] = []
    seen: set[str] = set()
    for feature in features:
        properties = feature.get("properties")
        if not isinstance(properties, dict) or properties.get("analysis_version") != ANALYSIS_VERSION:
            raise ValidationError("transit_points_p0 has an invalid analysis_version")
        stop_id = properties.get("stop_id")
        stop_name = properties.get("stop_name")
        if not isinstance(stop_id, str) or stop_id in seen:
            raise ValidationError("transit_points_p0 has missing or duplicate stop_id")
        point = shape(feature.get("geometry"))
        if point.geom_type != "Point" or point.is_empty or not point.is_valid:
            raise ValidationError(f"Transit stop {stop_id} is not a valid Point")
        seen.add(stop_id)
        stops.append((stop_id, str(stop_name or stop_id), point))
    if seen != set(P0_STOP_IDS):
        raise ValidationError("transit_points_p0 does not contain the frozen P0 stop IDs")
    return sorted(stops, key=lambda item: item[0])


def add_source_coordinates_to_index(
    index: dict[tuple[str, str], str], source_geometry: Any, metric_geometry: Any,
) -> None:
    """Index source vertices using their already-projected counterpart.

    This avoids per-coordinate CRS transforms across the full 55k-feature source
    and preserves exact projected values used by the later clip operation.
    """
    source_parts = line_parts(source_geometry)
    metric_parts = line_parts(metric_geometry)
    if len(source_parts) != len(metric_parts):
        raise ValidationError("Projection changed the number of source line parts")
    for source_line, metric_line in zip(source_parts, metric_parts, strict=True):
        source_coordinates = list(source_line.coords)
        metric_coordinates = list(metric_line.coords)
        if len(source_coordinates) != len(metric_coordinates):
            raise ValidationError("Projection changed the number of source vertices")
        for source_coordinate, metric_coordinate in zip(source_coordinates, metric_coordinates, strict=True):
            longitude = finite_coordinate(source_coordinate[0], "longitude")
            latitude = finite_coordinate(source_coordinate[1], "latitude")
            x_m = finite_coordinate(metric_coordinate[0], "metric x")
            y_m = finite_coordinate(metric_coordinate[1], "metric y")
            metric_key = coordinate_key(x_m, y_m)
            token = source_coordinate_token(longitude, latitude)
            existing = index.get(metric_key)
            if existing is not None and existing != token:
                raise ValidationError("Projected source-coordinate token collision")
            index[metric_key] = token


def create_node(
    registry: dict[str, NodeRecord], token: str, x_m: float, y_m: float, kind: str,
) -> NodeRecord:
    node_id = digest_id("node", {"v": 1, "token": token})
    existing = registry.get(node_id)
    if existing is None:
        record = NodeRecord(node_id, token, x_m, y_m, kind)
        registry[node_id] = record
        return record
    if existing.token != token or not math.isclose(existing.x_m, x_m, abs_tol=0.0) or not math.isclose(existing.y_m, y_m, abs_tol=0.0):
        raise ValidationError("Node ID collision or inconsistent coordinate registry")
    return existing


def build_graph_from_features(
    features: list[dict[str, Any]], routing_extent_metric: Any, road_hash: str,
) -> GraphResult:
    source_coordinate_index: dict[tuple[str, str], str] = {}
    nodes: dict[str, NodeRecord] = {}
    edges: list[EdgeRecord] = []
    graph = nx.MultiGraph()
    highway_after_clip: Counter[str] = Counter()
    included_highways: Counter[str] = Counter()
    frozen_excluded_highways: Counter[str] = Counter()
    observed_non_allowlisted: Counter[str] = Counter()
    clipped_context: list[LineString] = []
    features_after_clip = 0
    clipped_parts_before_filter = 0
    zero_length_dropped = 0

    for feature_index, feature in enumerate(features):
        properties = feature["properties"]
        highway = highway_value(properties, feature_index)
        source_geometry = shape(feature["geometry"])
        metric_geometry = to_metric(source_geometry)
        clipped = metric_geometry.intersection(routing_extent_metric)
        parts = [part for part in line_parts(clipped) if not part.is_empty and part.length > 0]
        if not parts:
            continue
        parts.sort(key=stable_line_key)
        features_after_clip += 1
        clipped_parts_before_filter += len(parts)
        highway_after_clip[highway] += 1
        clipped_context.extend(parts)

        if highway in FROZEN_EXCLUDE_HIGHWAYS:
            frozen_excluded_highways[highway] += 1
            continue
        if highway in APPROVED_NON_ALLOWLISTED_HIGHWAYS:
            observed_non_allowlisted[highway] += 1
            continue
        if highway not in INCLUDE_HIGHWAYS:
            raise ValidationError(f"Observed highway category requires review: {highway!r}")
        included_highways[highway] += 1
        add_source_coordinates_to_index(source_coordinate_index, source_geometry, metric_geometry)

        for part_index, line in enumerate(parts):
            coordinates = list(line.coords)
            for segment_index, (start, end) in enumerate(zip(coordinates, coordinates[1:])):
                start_x, start_y = finite_coordinate(start[0], "segment start x"), finite_coordinate(start[1], "segment start y")
                end_x, end_y = finite_coordinate(end[0], "segment end x"), finite_coordinate(end[1], "segment end y")
                segment = LineString(((start_x, start_y), (end_x, end_y)))
                length_m = float(segment.length)
                if not math.isfinite(length_m) or length_m <= 0:
                    zero_length_dropped += 1
                    continue

                start_token = source_coordinate_index.get(coordinate_key(start_x, start_y))
                if start_token is None:
                    start_token = boundary_coordinate_token(feature_index, part_index, segment_index, start_x, start_y)
                    start_kind = "clip_boundary"
                else:
                    start_kind = "source"
                end_token = source_coordinate_index.get(coordinate_key(end_x, end_y))
                if end_token is None:
                    end_token = boundary_coordinate_token(feature_index, part_index, segment_index + 1, end_x, end_y)
                    end_kind = "clip_boundary"
                else:
                    end_kind = "source"
                start_node = create_node(nodes, start_token, start_x, start_y, start_kind)
                end_node = create_node(nodes, end_token, end_x, end_y, end_kind)
                if start_node.node_id == end_node.node_id:
                    zero_length_dropped += 1
                    continue

                source_node, target_node = sorted((start_node.node_id, end_node.node_id))
                if source_node != start_node.node_id:
                    segment = LineString(tuple(reversed(segment.coords)))
                edge_payload = {
                    "v": 1,
                    "road_sha256": road_hash,
                    "osm_id": optional_property(properties.get("osm_id")),
                    "source_feature_index": feature_index,
                    "part_index": part_index,
                    "segment_index": segment_index,
                    "normalized_start": source_node,
                    "normalized_end": target_node,
                }
                edge_id = digest_id("edge", edge_payload)
                if graph.has_edge(source_node, target_node, key=edge_id):
                    raise ValidationError("Duplicate graph edge generated from one source segment")
                cost_seconds = length_m / WALKING_SPEED_MPS
                edge_properties = {
                    "edge_id": edge_id,
                    "source_node": source_node,
                    "target_node": target_node,
                    "osm_id": optional_property(properties.get("osm_id")),
                    "highway": highway,
                    "surface": optional_property(properties.get("surface")),
                    "bridge": optional_property(properties.get("bridge")),
                    "tunnel": optional_property(properties.get("tunnel")),
                    "layer": optional_property(properties.get("layer")),
                    "length_m": length_m,
                    "cost_seconds": cost_seconds,
                    "source_feature_index": feature_index,
                    "part_index": part_index,
                    "segment_index": segment_index,
                    "oneway": optional_property(properties.get("oneway")),
                }
                graph.add_edge(source_node, target_node, key=edge_id, **edge_properties)
                edges.append(EdgeRecord(edge_id, source_node, target_node, segment, edge_properties))

    if not edges:
        raise ValidationError("Walking-proxy filter produced no valid edges")
    for node_id in nodes:
        graph.add_node(node_id)
    components: dict[str, str] = {}
    component_sets = sorted(nx.connected_components(graph), key=lambda item: min(item))
    for component_index, component in enumerate(component_sets, start=1):
        component_id = f"cc_{component_index:06d}"
        for node_id in component:
            components[node_id] = component_id

    coordinates_to_nodes: dict[tuple[str, str], list[NodeRecord]] = defaultdict(list)
    for node in nodes.values():
        coordinates_to_nodes[diagnostic_coordinate_key(node.x_m, node.y_m)].append(node)
    co_located = [
        node_list for node_list in coordinates_to_nodes.values()
        if len(node_list) > 1 and any(node.kind == "clip_boundary" for node in node_list)
    ]
    largest_component_nodes = max((len(component) for component in component_sets), default=0)
    diagnostics = {
        "features_after_clip": features_after_clip,
        "features_before_highway_filter": features_after_clip,
        "clipped_line_part_count_before_highway_filter": clipped_parts_before_filter,
        "features_after_highway_filter": sum(included_highways.values()),
        "included_highway_categories": dict(sorted(included_highways.items())),
        "frozen_excluded_highway_categories": dict(sorted(frozen_excluded_highways.items())),
        "observed_non_allowlisted_highway_categories": dict(sorted(observed_non_allowlisted.items())),
        "highway_counts_after_clip": dict(sorted(highway_after_clip.items())),
        "generated_node_count": len(nodes),
        "generated_edge_count": len(edges),
        "connected_component_count": len(component_sets),
        "largest_component_node_count": largest_component_nodes,
        "largest_component_node_percentage": (largest_component_nodes / len(nodes) * 100.0),
        "zero_length_edge_count_dropped": zero_length_dropped,
        "co_located_clip_boundary_coordinate_count": len(co_located),
        "co_located_clip_boundary_distinct_node_count": sum(len(items) for items in co_located),
    }
    return GraphResult(nodes, edges, components, diagnostics, clipped_context)


def feature_collection(name: str, features: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "metadata": {"output_name": name, **metadata}, "features": features}


def graph_collections(result: GraphResult, common_metadata: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    node_features: list[dict[str, Any]] = []
    for node in sorted(result.nodes.values(), key=lambda item: item.node_id):
        point_web = to_web(Point(node.x_m, node.y_m))
        properties = {
            "node_id": node.node_id,
            "x_m": node.x_m,
            "y_m": node.y_m,
            "component_id": result.components[node.node_id],
        }
        node_features.append({"type": "Feature", "properties": properties, "geometry": mapping(point_web)})
    edge_features: list[dict[str, Any]] = []
    for edge in sorted(result.edges, key=lambda item: (item.source_node, item.target_node, item.edge_id)):
        edge_features.append({
            "type": "Feature", "properties": edge.properties, "geometry": mapping(to_web(edge.geometry_metric)),
        })
    return (
        feature_collection("pedestrian_nodes", node_features, common_metadata),
        feature_collection("pedestrian_edges", edge_features, common_metadata),
    )


def validate_graph_collections(nodes_collection: dict[str, Any], edges_collection: dict[str, Any]) -> None:
    node_features = nodes_collection["features"]
    edge_features = edges_collection["features"]
    node_ids = {feature["properties"]["node_id"] for feature in node_features}
    if len(node_ids) != len(node_features):
        raise ValidationError("Node IDs are not unique")
    if not node_features or not edge_features:
        raise ValidationError("Graph output must contain nodes and edges")
    for feature in node_features:
        if tuple(feature["properties"].keys()) != NODE_FIELDS:
            raise ValidationError("Node output schema differs from contract")
        geometry = shape(feature["geometry"])
        if geometry.geom_type != "Point" or not geometry.is_valid:
            raise ValidationError("Node output geometry is invalid")
    edge_ids: set[str] = set()
    for feature in edge_features:
        properties = feature["properties"]
        if tuple(properties.keys()) != EDGE_FIELDS:
            raise ValidationError("Edge output schema differs from contract")
        if properties["edge_id"] in edge_ids:
            raise ValidationError("Edge IDs are not unique")
        edge_ids.add(properties["edge_id"])
        if properties["source_node"] not in node_ids or properties["target_node"] not in node_ids:
            raise ValidationError("Edge endpoint is absent from node output")
        if properties["source_node"] >= properties["target_node"]:
            raise ValidationError("Undirected edge endpoints are not canonical ordered")
        if properties["highway"] not in INCLUDE_HIGHWAYS:
            raise ValidationError("Non-allowlisted highway remains in edge output")
        length_m = properties["length_m"]
        cost_seconds = properties["cost_seconds"]
        if not math.isfinite(length_m) or not math.isfinite(cost_seconds) or length_m <= 0 or cost_seconds <= 0:
            raise ValidationError("Edge length or cost is not positive and finite")
        if not math.isclose(cost_seconds, length_m / WALKING_SPEED_MPS, rel_tol=1e-12, abs_tol=1e-12):
            raise ValidationError("Edge walking cost does not match frozen speed")
        geometry = shape(feature["geometry"])
        if geometry.geom_type != "LineString" or geometry.is_empty or not geometry.is_valid:
            raise ValidationError("Edge output geometry is invalid")


def svg_path(line: LineString, min_x: float, max_y: float) -> str:
    points = [f"{x - min_x:.3f},{max_y - y:.3f}" for x, y, *_ in line.coords]
    return "M " + " L ".join(points)


def render_coverage_diagnostic(
    path: Path, result: GraphResult, study_area_metric: Any, transit_stops: list[tuple[str, str, Point]],
    metadata: dict[str, Any], overwrite: bool, repository_root: Path,
) -> None:
    min_x, min_y, max_x, max_y = study_area_metric.bounds
    padding = max(max_x - min_x, max_y - min_y) * 0.03
    min_x -= padding
    min_y -= padding
    max_x += padding
    max_y += padding
    width = max_x - min_x
    height = max_y - min_y
    context_paths = "".join(
        f'<path class="context" d="{svg_path(line, min_x, max_y)}" />' for line in result.clipped_context
    )
    edge_paths = "".join(
        f'<path class="edge" d="{svg_path(edge.geometry_metric, min_x, max_y)}" />'
        for edge in sorted(result.edges, key=lambda item: item.edge_id)
    )
    study_paths = "".join(
        f'<path class="study" d="{svg_path(line, min_x, max_y)}" />' for line in line_parts(study_area_metric.boundary)
    )
    stop_markup: list[str] = []
    for stop_id, stop_name, point_web in transit_stops:
        point_metric = to_metric(point_web)
        x = point_metric.x - min_x
        y = max_y - point_metric.y
        label = html.escape(stop_name)
        stop_markup.append(
            f'<g class="stop" data-stop-id="{html.escape(stop_id)}"><circle cx="{x:.3f}" cy="{y:.3f}" r="13" />'
            f'<text x="{x + 18:.3f}" y="{y - 12:.3f}">{label}</text></g>'
        )
    summary = html.escape(canonical_json(metadata))
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>RUJAK P0 Pedestrian Graph Coverage Diagnostic</title>
<style>
body{{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#172033}}main{{padding:18px}}svg{{width:100%;height:auto;background:#fff;border:1px solid #cbd5e1}}.context{{fill:none;stroke:#cbd5e1;stroke-width:3}}.edge{{fill:none;stroke:#0f766e;stroke-width:5;stroke-linecap:round}}.study{{fill:none;stroke:#7c3aed;stroke-width:8;stroke-dasharray:18 12}}.stop circle{{fill:#dc2626;stroke:#fff;stroke-width:5}}.stop text{{font-size:34px;paint-order:stroke;stroke:#fff;stroke-width:8;stroke-linejoin:round;fill:#111827}}.legend{{display:flex;gap:18px;flex-wrap:wrap}}.key{{font-weight:700}}pre{{white-space:pre-wrap;word-break:break-word}}</style>
</head><body><main><h1>RUJAK P0 pedestrian graph coverage diagnostic</h1><p>Validation-only overlay; it does not perform snapping, routing, or accessibility analysis.</p>
<p class="legend"><span class="key" style="color:#0f766e">— Walking graph</span><span class="key" style="color:#cbd5e1">— Clipped road context</span><span class="key" style="color:#7c3aed">— P0 study area</span><span class="key" style="color:#dc2626">● Canonical transit stop</span></p>
<svg viewBox="0 0 {width:.3f} {height:.3f}" role="img" aria-label="Walking graph, clipped roads, P0 study area, and nine canonical transit stops">{context_paths}{edge_paths}{study_paths}{''.join(stop_markup)}</svg>
<h2>Reproducibility metadata</h2><pre>{summary}</pre></main></body></html>\n"""
    atomic_write_text(path, document, overwrite, repository_root)


def run_pipeline(
    roads_path: Path, routing_extent_path: Path, study_area_path: Path, transit_points_path: Path,
    output_root: Path, coverage_diagnostic: Path, overwrite: bool = False,
    repository_root: Path | None = None,
) -> dict[str, Any]:
    repository_root = (repository_root or Path.cwd()).resolve()
    paths = {
        "roads": roads_path.resolve(), "routing_extent": routing_extent_path.resolve(),
        "study_area": study_area_path.resolve(), "transit_points": transit_points_path.resolve(),
    }
    if any(not path.is_file() for path in paths.values()):
        missing = [name for name, path in paths.items() if not path.is_file()]
        raise ValidationError(f"Required input files are missing: {', '.join(missing)}")
    hashes_before = {name: sha256_file(path) for name, path in paths.items()}
    road_features = validate_road_source(read_json(paths["roads"]))
    routing_extent_web = validate_phase1_area(read_json(paths["routing_extent"]), "routing_processing_extent", "additional_buffer_m")
    study_area_web = validate_phase1_area(read_json(paths["study_area"]), "study_area_p0")
    transit_stops = validate_transit_points(read_json(paths["transit_points"]))
    routing_extent_metric = to_metric(routing_extent_web)
    study_area_metric = to_metric(study_area_web)
    if not routing_extent_metric.covers(study_area_metric):
        raise ValidationError("routing_processing_extent does not cover study_area_p0")
    result = build_graph_from_features(road_features, routing_extent_metric, hashes_before["roads"])
    source_files = [
        {"path": relative_source_path(path, repository_root), "sha256": hashes_before[name]}
        for name, path in paths.items()
    ]
    common_metadata = {
        "analysis_version": ANALYSIS_VERSION,
        "output_crs": WEB_CRS,
        "metric_crs": METRIC_CRS,
        "walking_speed_mps": WALKING_SPEED_MPS,
        "source_files": source_files,
        "topology": "shared-source-coordinates-only",
        "graph_type": "undirected_multigraph",
    }
    nodes_collection, edges_collection = graph_collections(result, common_metadata)
    validate_graph_collections(nodes_collection, edges_collection)
    output_root = output_root.resolve()
    output_paths = {
        "pedestrian_nodes": output_root / "processed" / "p0" / "pedestrian_nodes.geojson",
        "pedestrian_edges": output_root / "processed" / "p0" / "pedestrian_edges.geojson",
        "coverage_diagnostic": coverage_diagnostic.resolve(),
    }
    atomic_write_json(output_paths["pedestrian_nodes"], nodes_collection, overwrite, repository_root)
    atomic_write_json(output_paths["pedestrian_edges"], edges_collection, overwrite, repository_root)
    coverage_metadata = {
        **common_metadata,
        "diagnostics": result.diagnostics,
        "coverage_scope": "visual-only; no snapping or routing",
    }
    render_coverage_diagnostic(
        output_paths["coverage_diagnostic"], result, study_area_metric, transit_stops,
        coverage_metadata, overwrite, repository_root,
    )
    hashes_after = {name: sha256_file(path) for name, path in paths.items()}
    if hashes_before != hashes_after:
        raise ValidationError("Input hash changed during Phase-02 processing")
    return {
        "analysis_version": ANALYSIS_VERSION,
        "input_crs": WEB_CRS,
        "metric_processing_crs": METRIC_CRS,
        "walking_speed_mps": WALKING_SPEED_MPS,
        "raw_road_feature_count": len(road_features),
        "invalid_geometries_encountered": 0,
        "invalid_geometries_dropped_or_repaired": 0,
        **result.diagnostics,
        "raw_hashes": {relative_source_path(paths[name], repository_root): digest for name, digest in hashes_before.items()},
        "outputs": {name: display_path(path, repository_root) for name, path in output_paths.items()},
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roads", type=Path, required=True)
    parser.add_argument("--routing-extent", type=Path, required=True)
    parser.add_argument("--study-area", type=Path, required=True)
    parser.add_argument("--transit-points", type=Path, required=True)
    parser.add_argument("--coverage-diagnostic", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--analysis-version", default=ANALYSIS_VERSION)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.analysis_version != ANALYSIS_VERSION:
        print(f"analysis_version must be {ANALYSIS_VERSION}", file=sys.stderr)
        return 2
    try:
        diagnostics = run_pipeline(
            args.roads, args.routing_extent, args.study_area, args.transit_points,
            args.output_root, args.coverage_diagnostic, args.overwrite, Path.cwd(),
        )
    except ValidationError as exc:
        print(f"PHASE-02 validation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(diagnostics, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
