#!/usr/bin/env python
"""Build deterministic RUJAK P0 canonical spatial artifacts from immutable raw inputs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import unicodedata
import uuid
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any, Iterable

from pyproj import Transformer
from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.ops import transform


ANALYSIS_VERSION = "p0-central-v1"
WEB_CRS = "EPSG:4326"
METRIC_CRS = "EPSG:32749"
STUDY_AREA_BUFFER_METERS = 1000
ROUTING_EXTENT_BUFFER_METERS = 300
BUFFER_QUAD_SEGS = 16
CULINARY_COORDINATE_TOLERANCE = 0.000001
TRANSIT_BASELINE_TOLERANCE = 0.0000001
RUJAK_MERCHANT_NAMESPACE = uuid.UUID("c7e6bb16-9db1-560a-aa6b-781ebf8990be")

TRANSIT_SOURCE = "SurveiActivities.GeoJSON"
CULINARY_SOURCE = "MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson"
TRANSIT_SCOPE = "p0-central"
VALIDATION_STATUS = "valid"


@dataclass(frozen=True)
class StopBaseline:
    stop_id: str
    name: str
    longitude: float
    latitude: float


# Master Technical Implementation Guide, Section 3.2. Validation fixture only;
# output geometry is always sourced from the Survey Activities raw activity.
P0_STOP_BASELINES = (
    StopBaseline("6a94322752d86e03b51f0365", "Halte Pemuda RRI", 112.7476589, -7.2652738),
    StopBaseline("6a94304b52d86e03b51efc92", "Bus Stop Grand City", 112.7503281, -7.2629196),
    StopBaseline("6a942f5e52d86e03b51efa52", "Bus Stop Balai Kota A", 112.7479517, -7.2609883),
    StopBaseline("6a92c82852d86e03b51dbb58", "Halte Pangsud", 112.7449579, -7.2664402),
    StopBaseline("6a92c77152d86e03b51db962", "Halte Simpang Dukuh", 112.7419137, -7.2630167),
    StopBaseline("6a92c6ad52d86e03b51db794", "Bus Stop Tunjungan", 112.7392791, -7.2598872),
    StopBaseline("6a92c5e152d86e03b51db51f", "Bus Stop Siola", 112.7378236, -7.2573828),
    StopBaseline("6a92b2233f59e23bb862c962", "Halte Embong Malang", 112.7374723, -7.2605207),
    StopBaseline("6a92b1273f59e23bb862c863", "Halte Kaliasin", 112.7409600, -7.2647000),
)
P0_STOP_IDS = tuple(item.stop_id for item in P0_STOP_BASELINES)

TRANSIT_OUTPUT_FIELDS = (
    "analysis_version", "stop_id", "stop_name", "description_raw", "surveyed_at",
    "surveyor", "media", "source", "validation_status", "scope", "source_file",
    "source_sha256", "source_activity_index",
)
CULINARY_OUTPUT_FIELDS = (
    "analysis_version", "merchant_id", "merchant_name", "category_l1", "category_l2",
    "category_l3", "phone", "address", "district", "village", "status",
    "collected_at", "updated_at", "source", "validation_status", "source_file",
    "source_sha256", "source_feature_index",
)
REVIEW_COLUMNS = (
    "analysis_version", "stop_id", "stop_name", "source", "validation_status", "scope",
    "source_file", "source_sha256", "source_activity_index", "description_raw",
    "surveyed_at", "surveyor", "suggested_shelter", "suggested_seating",
    "suggested_pedestrian_condition", "suggested_cleanliness", "suggested_traffic_condition",
    "suggested_rationale", "suggestion_confidence", "review_status", "approved_shelter",
    "approved_seating", "approved_pedestrian_condition", "approved_cleanliness",
    "approved_traffic_condition", "reviewed_by", "reviewed_at", "review_notes",
)


class ValidationError(RuntimeError):
    """Raised when a frozen Phase-1 contract is not met."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def read_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Cannot read JSON from {path}: {exc}") from exc


def relative_source_path(path: Path, repository_root: Path) -> str:
    try:
        return path.resolve().relative_to(repository_root.resolve()).as_posix()
    except ValueError as exc:
        raise ValidationError(f"Raw input must be inside repository root: {path}") from exc


def display_path(path: Path, repository_root: Path) -> str:
    try:
        return path.resolve().relative_to(repository_root.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def optional_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return str(value)
    value = value.strip()
    return value or None


def normalize_merchant_identity(value: Any) -> str:
    if not isinstance(value, str):
        raise ValidationError("merchant_name must be a source string")
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = " ".join(normalized.split())
    if not normalized:
        raise ValidationError("merchant_name is null or blank after normalization")
    return normalized


def normalized_coordinate(value: Any) -> str:
    try:
        number = Decimal(str(value))
    except Exception as exc:  # Decimal's exception set is implementation detail.
        raise ValidationError(f"Coordinate is not a decimal: {value!r}") from exc
    if not number.is_finite():
        raise ValidationError(f"Coordinate is not finite: {value!r}")
    number = number.quantize(Decimal("0.0000001"), rounding=ROUND_HALF_EVEN)
    if number == 0:
        number = Decimal("0.0000000")
    return format(number, ".7f")


def merchant_uuid(merchant_name: Any, longitude: Any, latitude: Any) -> str:
    identity = "|".join((
        normalize_merchant_identity(merchant_name),
        normalized_coordinate(longitude),
        normalized_coordinate(latitude),
    ))
    return str(uuid.uuid5(RUJAK_MERCHANT_NAMESPACE, identity))


def validate_point_geometry(geometry: Any, label: str) -> Point:
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        raise ValidationError(f"{label} must be a GeoJSON Point")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        raise ValidationError(f"{label} must have exactly two coordinates")
    try:
        longitude, latitude = (float(coordinates[0]), float(coordinates[1]))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label} coordinates are not numeric") from exc
    if not math.isfinite(longitude) or not math.isfinite(latitude):
        raise ValidationError(f"{label} coordinates must be finite")
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise ValidationError(f"{label} coordinates are outside EPSG:4326 bounds")
    point = Point(longitude, latitude)
    if point.is_empty or not point.is_valid:
        raise ValidationError(f"{label} is not a valid point")
    return point


def load_survey_activities(path: Path) -> list[dict[str, Any]]:
    document = read_json(path)
    if not isinstance(document, dict):
        raise ValidationError("Survey Activities root must be an object")
    if document.get("success") is not True or not isinstance(document.get("data"), dict):
        raise ValidationError("Survey Activities must be a successful API wrapper with data")
    activities = document["data"].get("activities")
    if not isinstance(activities, list):
        raise ValidationError("Survey Activities collection must be data.activities")
    meta_total = document.get("meta", {}).get("total") if isinstance(document.get("meta"), dict) else None
    if meta_total is not None and meta_total != len(activities):
        raise ValidationError("Survey Activities meta.total does not match data.activities")
    required = ("_id", "title", "description", "geometry", "created_at", "user_name", "medias")
    for index, activity in enumerate(activities):
        if not isinstance(activity, dict):
            raise ValidationError(f"Activity {index} is not an object")
        missing = [field for field in required if field not in activity or activity[field] is None]
        if missing:
            raise ValidationError(f"Activity {index} missing required fields: {', '.join(missing)}")
        if not isinstance(activity["_id"], str) or not activity["_id"]:
            raise ValidationError(f"Activity {index} has invalid _id")
        validate_point_geometry(activity["geometry"], f"Activity {activity['_id']}")
    return activities


def select_p0_stops(activities: list[dict[str, Any]]) -> list[tuple[int, dict[str, Any]]]:
    indexed: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for index, activity in enumerate(activities):
        indexed.setdefault(activity["_id"], []).append((index, activity))
    selected: list[tuple[int, dict[str, Any]]] = []
    for baseline in P0_STOP_BASELINES:
        matches = indexed.get(baseline.stop_id, [])
        if len(matches) != 1:
            raise ValidationError(
                f"Expected exactly one activity for {baseline.stop_id}; found {len(matches)}"
            )
        activity_index, activity = matches[0]
        point = validate_point_geometry(activity["geometry"], f"Activity {baseline.stop_id}")
        longitude_delta = abs(point.x - baseline.longitude)
        latitude_delta = abs(point.y - baseline.latitude)
        if longitude_delta > TRANSIT_BASELINE_TOLERANCE or latitude_delta > TRANSIT_BASELINE_TOLERANCE:
            raise ValidationError(
                f"Activity {baseline.stop_id} differs from Master Guide coordinate baseline: "
                f"lon={longitude_delta}, lat={latitude_delta}"
            )
        selected.append((activity_index, activity))
    stop_ids = [activity["_id"] for _, activity in selected]
    if len(selected) != 9 or len(set(stop_ids)) != 9:
        raise ValidationError("P0 transit selection must contain exactly nine unique stop_id values")
    return selected


def to_metric(geometry: Any) -> Any:
    transformer = Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True)
    return transform(transformer.transform, geometry)


def to_web(geometry: Any) -> Any:
    transformer = Transformer.from_crs(METRIC_CRS, WEB_CRS, always_xy=True)
    return transform(transformer.transform, geometry)


def build_p0_areas(selected_stops: list[tuple[int, dict[str, Any]]]) -> tuple[Any, Any]:
    metric_points = [
        to_metric(validate_point_geometry(activity["geometry"], f"Activity {activity['_id']}"))
        for _, activity in selected_stops
    ]
    hull = MultiPoint(metric_points).convex_hull
    study_area = hull.buffer(STUDY_AREA_BUFFER_METERS, quad_segs=BUFFER_QUAD_SEGS)
    routing_extent = study_area.buffer(ROUTING_EXTENT_BUFFER_METERS, quad_segs=BUFFER_QUAD_SEGS)
    for label, geometry in (("study_area_p0", study_area), ("routing_processing_extent", routing_extent)):
        if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValidationError(f"{label} is not a valid polygonal metric geometry")
    if not routing_extent.covers(study_area):
        raise ValidationError("routing_processing_extent must cover study_area_p0")
    return study_area, routing_extent


def coordinate_property(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label} is not numeric") from exc
    if not math.isfinite(number):
        raise ValidationError(f"{label} is not finite")
    return number


def canonicalize_culinary(
    document: Any,
    study_area_metric: Any,
    source_file: str,
    source_sha256: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        raise ValidationError("Culinary input must be a GeoJSON FeatureCollection")
    features = document.get("features")
    if not isinstance(features, list):
        raise ValidationError("Culinary FeatureCollection must have a features array")

    required = (
        "NAMA", "TIPE_1", "TIPE_2", "TIPE_3", "TELEPON", "ALAMAT", "KECAMATAN",
        "DESA", "LONGITUDE", "LATITUDE", "STATUS", "TANGGAL PENGUMPULAN", "TANGGAL UPDATE",
    )
    diagnostics: dict[str, Any] = {
        "raw_culinary_count": len(features), "invalid_geometry_count": 0,
        "unnamed_excluded_count": 0, "outside_study_area_count": 0,
        "coordinate_comparable_count": 0, "coordinate_missing_or_malformed_count": 0,
        "coordinate_mismatch_count": 0, "max_longitude_delta": 0.0, "max_latitude_delta": 0.0,
        "geometry_types": Counter(), "null_counts": Counter(), "blank_counts": Counter(),
    }
    records: list[dict[str, Any]] = []
    merchant_ids: set[str] = set()
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValidationError(f"Culinary feature {index} is not a GeoJSON Feature")
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            raise ValidationError(f"Culinary feature {index} has no properties object")
        missing = [field for field in required if field not in properties]
        if missing:
            raise ValidationError(f"Culinary feature {index} missing fields: {', '.join(missing)}")
        for field in required:
            value = properties[field]
            if value is None:
                diagnostics["null_counts"][field] += 1
            elif isinstance(value, str) and not value.strip():
                diagnostics["blank_counts"][field] += 1
        geometry = feature.get("geometry")
        geometry_type = geometry.get("type") if isinstance(geometry, dict) else "<null>"
        diagnostics["geometry_types"][geometry_type] += 1
        try:
            point = validate_point_geometry(geometry, f"Culinary feature {index}")
        except ValidationError:
            diagnostics["invalid_geometry_count"] += 1
            continue
        try:
            property_longitude = coordinate_property(properties["LONGITUDE"], f"Culinary feature {index} LONGITUDE")
            property_latitude = coordinate_property(properties["LATITUDE"], f"Culinary feature {index} LATITUDE")
        except ValidationError as exc:
            diagnostics["coordinate_missing_or_malformed_count"] += 1
            raise ValidationError(str(exc)) from exc
        longitude_delta = abs(point.x - property_longitude)
        latitude_delta = abs(point.y - property_latitude)
        diagnostics["coordinate_comparable_count"] += 1
        diagnostics["max_longitude_delta"] = max(diagnostics["max_longitude_delta"], longitude_delta)
        diagnostics["max_latitude_delta"] = max(diagnostics["max_latitude_delta"], latitude_delta)
        if longitude_delta > CULINARY_COORDINATE_TOLERANCE or latitude_delta > CULINARY_COORDINATE_TOLERANCE:
            diagnostics["coordinate_mismatch_count"] += 1
            raise ValidationError(
                f"Culinary feature {index} geometry/properties coordinate mismatch: "
                f"lon={longitude_delta}, lat={latitude_delta}"
            )
        try:
            normalized_name = normalize_merchant_identity(properties["NAMA"])
        except ValidationError:
            diagnostics["unnamed_excluded_count"] += 1
            continue
        merchant_name = optional_text(properties["NAMA"])
        if merchant_name is None:
            diagnostics["unnamed_excluded_count"] += 1
            continue
        merchant_id = merchant_uuid(properties["NAMA"], geometry["coordinates"][0], geometry["coordinates"][1])
        if merchant_id in merchant_ids:
            raise ValidationError(f"Duplicate merchant_id generated at source feature {index}: {merchant_id}")
        if not study_area_metric.covers(to_metric(point)):
            diagnostics["outside_study_area_count"] += 1
            continue
        merchant_ids.add(merchant_id)
        records.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [point.x, point.y]},
            "properties": {
                "analysis_version": ANALYSIS_VERSION,
                "merchant_id": merchant_id,
                "merchant_name": merchant_name,
                "category_l1": optional_text(properties["TIPE_1"]),
                "category_l2": optional_text(properties["TIPE_2"]),
                "category_l3": optional_text(properties["TIPE_3"]),
                "phone": optional_text(properties["TELEPON"]),
                "address": optional_text(properties["ALAMAT"]),
                "district": optional_text(properties["KECAMATAN"]),
                "village": optional_text(properties["DESA"]),
                "status": optional_text(properties["STATUS"]),
                "collected_at": optional_text(properties["TANGGAL PENGUMPULAN"]),
                "updated_at": optional_text(properties["TANGGAL UPDATE"]),
                "source": CULINARY_SOURCE,
                "validation_status": VALIDATION_STATUS,
                "source_file": source_file,
                "source_sha256": source_sha256,
                "source_feature_index": index,
            },
        })
        # Keep this named normalized value exercised and intentional for validation review.
        assert normalized_name
    records.sort(key=lambda feature: (feature["properties"]["merchant_id"], feature["properties"]["source_feature_index"]))
    diagnostics["p0_culinary_count"] = len(records)
    diagnostics["geometry_types"] = dict(sorted(diagnostics["geometry_types"].items()))
    diagnostics["null_counts"] = dict(sorted(diagnostics["null_counts"].items()))
    diagnostics["blank_counts"] = dict(sorted(diagnostics["blank_counts"].items()))
    return records, diagnostics


def feature_collection(name: str, features: list[dict[str, Any]], sources: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "metadata": {
            "analysis_version": ANALYSIS_VERSION,
            "output_name": name,
            "output_crs": WEB_CRS,
            "source_files": sources,
        },
        "features": features,
    }


def transit_features(
    selected_stops: list[tuple[int, dict[str, Any]]], source_file: str, source_sha256: str
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, activity in selected_stops:
        point = validate_point_geometry(activity["geometry"], f"Activity {activity['_id']}")
        records.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [point.x, point.y]},
            "properties": {
                "analysis_version": ANALYSIS_VERSION,
                "stop_id": activity["_id"],
                "stop_name": activity["title"],
                "description_raw": activity["description"],
                "surveyed_at": activity["created_at"],
                "surveyor": activity["user_name"],
                "media": activity["medias"],
                "source": TRANSIT_SOURCE,
                "validation_status": VALIDATION_STATUS,
                "scope": TRANSIT_SCOPE,
                "source_file": source_file,
                "source_sha256": source_sha256,
                "source_activity_index": index,
            },
        })
    return records


def area_features(
    study_area_metric: Any, routing_extent_metric: Any, source_file: str, source_sha256: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    study_geometry = mapping(to_web(study_area_metric))
    routing_geometry = mapping(to_web(routing_extent_metric))
    stop_ids = list(P0_STOP_IDS)
    study = {
        "type": "Feature",
        "geometry": study_geometry,
        "properties": {
            "analysis_version": ANALYSIS_VERSION,
            "area_id": "study_area_p0",
            "metric_crs": METRIC_CRS,
            "web_crs": WEB_CRS,
            "construction": "convex_hull_of_9_p0_stops_buffered_1000m",
            "buffer_m": STUDY_AREA_BUFFER_METERS,
            "stop_ids": stop_ids,
            "transit_source_file": source_file,
            "transit_source_sha256": source_sha256,
        },
    }
    routing = {
        "type": "Feature",
        "geometry": routing_geometry,
        "properties": {
            "analysis_version": ANALYSIS_VERSION,
            "area_id": "routing_processing_extent",
            "metric_crs": METRIC_CRS,
            "web_crs": WEB_CRS,
            "construction": "study_area_p0_buffered_300m",
            "additional_buffer_m": ROUTING_EXTENT_BUFFER_METERS,
            "study_area_id": "study_area_p0",
            "transit_source_file": source_file,
            "transit_source_sha256": source_sha256,
        },
    }
    return study, routing


def review_rows(transit: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for feature in transit:
        props = feature["properties"]
        row = {column: "" for column in REVIEW_COLUMNS}
        row.update({
            "analysis_version": props["analysis_version"], "stop_id": props["stop_id"],
            "stop_name": props["stop_name"], "source": props["source"],
            "validation_status": props["validation_status"], "scope": props["scope"],
            "source_file": props["source_file"], "source_sha256": props["source_sha256"],
            "source_activity_index": props["source_activity_index"],
            "description_raw": props["description_raw"], "surveyed_at": props["surveyed_at"],
            "surveyor": props["surveyor"], "review_status": "pending",
        })
        rows.append(row)
    return rows


DATA_DICTIONARY = """# P0 Data Dictionary

## Contract

All Phase-1 GeoJSON outputs use EPSG:4326 longitude/latitude coordinates and
`analysis_version = p0-central-v1`. Raw inputs are immutable. Each output stores
the relative source path and SHA-256 lineage in its metadata and feature fields.

## `transit_points_p0.geojson`

Exactly nine Survey Activities Points selected only by the frozen `_id` values.
`stop_id` is the canonical primary identifier; `stop_name` is display-only.
`source` is always `SurveiActivities.GeoJSON`; `validation_status` is `valid`;
and `scope` is `p0-central`. `valid` means the Phase-1 structural, exact-ID,
geometry, CRS, and required-field checks passed. It is not an Access Quality
approval or routing eligibility claim. `source_file`, `source_sha256`, and
`source_activity_index` are supplemental lineage fields.

Fields: `analysis_version`, `stop_id`, `stop_name`, `description_raw`,
`surveyed_at`, `surveyor`, `media`, `source`, `validation_status`, `scope`,
`source_file`, `source_sha256`, `source_activity_index`, and Point `geometry`.

## `study_area_p0.geojson` and `routing_processing_extent.geojson`

`study_area_p0` is the convex hull of the nine raw transit points after
EPSG:4326-to-EPSG:32749 transformation, buffered by 1,000 metres. The routing
extent is the in-memory metric study area buffered by another 300 metres. Both
are output in EPSG:4326 and preserve the transit source path/hash.

## `culinary_poi_p0.geojson`

Features are source culinary Points covered by the metric study area, including
the boundary (`study_area_metric.covers(point_metric)`). `merchant_id` is UUIDv5
using namespace `c7e6bb16-9db1-560a-aa6b-781ebf8990be` and the normalized
`merchant_name|longitude|latitude` identity string. Name normalization is NFKC,
Unicode casefold, collapsed Unicode whitespace, and trim. Geometry coordinates
are authoritative and serialized to seven decimals with decimal half-even
rounding; `LONGITUDE`/`LATITUDE` are a mandatory <=0.000001-degree cross-check.

`merchant_name` is NOT NULL. Null/blank names are excluded before ID generation.
Optional blank attributes such as `TELEPON` become null. No price, rating,
hours, menu, or enrichment fields are created. `source` is always
`MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson`; `validation_status`
is `valid` with the same Phase-1-only meaning described above. Lineage fields
are `source_file`, `source_sha256`, and `source_feature_index`.

Mapped fields: `NAMA` -> `merchant_name`, `TIPE_1` -> `category_l1`, `TIPE_2`
-> `category_l2`, `TIPE_3` -> `category_l3`, `TELEPON` -> `phone`, `ALAMAT`
-> `address`, `KECAMATAN` -> `district`, `DESA` -> `village`, `STATUS` ->
`status`, `TANGGAL PENGUMPULAN` -> `collected_at`, and `TANGGAL UPDATE` ->
`updated_at`.

## `access_quality_p0_review.csv`

This is a nine-row human-review seed, not an approved accessibility dataset.
`description_raw` and source fields are evidence. `suggested_shelter`,
`suggested_seating`, `suggested_pedestrian_condition`, `suggested_cleanliness`,
and `suggested_traffic_condition` are optional suggestions and begin blank.
The matching `approved_*`, `reviewed_by`, `reviewed_at`, and `review_notes`
columns begin blank. `review_status` is always initially `pending`. Survey
evidence concerns the stop/local surroundings, not the whole pedestrian corridor.
"""


def ensure_safe_output_path(path: Path, repository_root: Path, overwrite: bool) -> None:
    resolved = path.resolve()
    raw_root = (repository_root / "data" / "raw").resolve()
    if resolved == raw_root or raw_root in resolved.parents:
        raise ValidationError(f"Refusing to write inside immutable raw data: {path}")
    if path.exists() and not overwrite:
        raise ValidationError(f"Output exists; re-run with --overwrite: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)


def atomic_write_text(path: Path, content: str, overwrite: bool, repository_root: Path) -> None:
    ensure_safe_output_path(path, repository_root, overwrite)
    partial = path.with_name(path.name + ".partial")
    try:
        partial.write_text(content, encoding="utf-8", newline="\n")
        os.replace(partial, path)
    finally:
        if partial.exists():
            partial.unlink()


def atomic_write_json(path: Path, value: Any, overwrite: bool, repository_root: Path) -> None:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    atomic_write_text(path, serialized, overwrite, repository_root)


def atomic_write_csv(path: Path, rows: list[dict[str, Any]], overwrite: bool, repository_root: Path) -> None:
    ensure_safe_output_path(path, repository_root, overwrite)
    partial = path.with_name(path.name + ".partial")
    try:
        with partial.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        os.replace(partial, path)
    finally:
        if partial.exists():
            partial.unlink()


def validate_p0_outputs(
    transit_collection: dict[str, Any], study_collection: dict[str, Any], routing_collection: dict[str, Any],
    culinary_collection: dict[str, Any], review: list[dict[str, Any]], study_area_metric: Any,
    routing_extent_metric: Any,
) -> None:
    transit = transit_collection["features"]
    if len(transit) != 9:
        raise ValidationError("transit output does not have exactly nine features")
    if [feature["properties"]["stop_id"] for feature in transit] != list(P0_STOP_IDS):
        raise ValidationError("transit output is not in frozen stop-ID order")
    for feature in transit:
        props = feature["properties"]
        if set(props) != set(TRANSIT_OUTPUT_FIELDS):
            raise ValidationError("transit output schema differs from canonical contract")
        if (props["source"], props["validation_status"], props["scope"]) != (TRANSIT_SOURCE, VALIDATION_STATUS, TRANSIT_SCOPE):
            raise ValidationError("transit canonical field values are invalid")
        point = shape(feature["geometry"])
        if not study_area_metric.covers(to_metric(point)):
            raise ValidationError("study area does not cover a canonical transit stop")
    if not routing_extent_metric.covers(study_area_metric):
        raise ValidationError("routing extent does not cover study area")
    if len(study_collection["features"]) != 1 or len(routing_collection["features"]) != 1:
        raise ValidationError("area outputs must each contain one feature")
    merchant_ids: set[str] = set()
    for feature in culinary_collection["features"]:
        props = feature["properties"]
        if set(props) != set(CULINARY_OUTPUT_FIELDS):
            raise ValidationError("culinary output schema differs from canonical contract")
        if (props["source"], props["validation_status"]) != (CULINARY_SOURCE, VALIDATION_STATUS):
            raise ValidationError("culinary canonical field values are invalid")
        if not isinstance(props["merchant_name"], str) or not props["merchant_name"].strip():
            raise ValidationError("culinary output has null or blank merchant_name")
        if props["merchant_id"] in merchant_ids:
            raise ValidationError("culinary output merchant_id is not unique")
        merchant_ids.add(props["merchant_id"])
        point = shape(feature["geometry"])
        if point.geom_type != "Point" or not study_area_metric.covers(to_metric(point)):
            raise ValidationError("culinary output point is outside study area")
    if len(review) != 9 or any(row["review_status"] != "pending" for row in review):
        raise ValidationError("review CSV must have nine pending rows")
    for row in review:
        if any(row[field] for field in (
            "approved_shelter", "approved_seating", "approved_pedestrian_condition",
            "approved_cleanliness", "approved_traffic_condition", "reviewed_by", "reviewed_at", "review_notes",
        )):
            raise ValidationError("review CSV must not pre-populate approved fields")


def run_pipeline(
    transit_path: Path, culinary_path: Path, output_root: Path, data_dictionary: Path,
    overwrite: bool = False, repository_root: Path | None = None,
) -> dict[str, Any]:
    repository_root = (repository_root or Path.cwd()).resolve()
    transit_path = transit_path.resolve()
    culinary_path = culinary_path.resolve()
    if not transit_path.is_file() or not culinary_path.is_file():
        raise ValidationError("Both canonical raw input files must exist")
    transit_hash_before = sha256_file(transit_path)
    culinary_hash_before = sha256_file(culinary_path)
    transit_source_file = relative_source_path(transit_path, repository_root)
    culinary_source_file = relative_source_path(culinary_path, repository_root)

    activities = load_survey_activities(transit_path)
    selected_stops = select_p0_stops(activities)
    study_area_metric, routing_extent_metric = build_p0_areas(selected_stops)
    transit = transit_features(selected_stops, transit_source_file, transit_hash_before)
    culinary_records, culinary_diagnostics = canonicalize_culinary(
        read_json(culinary_path), study_area_metric, culinary_source_file, culinary_hash_before
    )
    sources = [
        {"path": transit_source_file, "sha256": transit_hash_before},
        {"path": culinary_source_file, "sha256": culinary_hash_before},
    ]
    transit_collection = feature_collection("transit_points_p0", transit, [sources[0]])
    study_feature, routing_feature = area_features(
        study_area_metric, routing_extent_metric, transit_source_file, transit_hash_before
    )
    study_collection = feature_collection("study_area_p0", [study_feature], [sources[0]])
    routing_collection = feature_collection("routing_processing_extent", [routing_feature], [sources[0]])
    culinary_collection = feature_collection("culinary_poi_p0", culinary_records, [sources[1]])
    review = review_rows(transit)
    validate_p0_outputs(
        transit_collection, study_collection, routing_collection, culinary_collection, review,
        study_area_metric, routing_extent_metric,
    )

    output_root = output_root.resolve()
    processed_root = output_root / "processed" / "p0"
    interim_root = output_root / "interim"
    output_paths = {
        "transit": processed_root / "transit_points_p0.geojson",
        "study_area": processed_root / "study_area_p0.geojson",
        "routing_extent": processed_root / "routing_processing_extent.geojson",
        "culinary": processed_root / "culinary_poi_p0.geojson",
        "review": interim_root / "access_quality_p0_review.csv",
        "data_dictionary": data_dictionary.resolve(),
    }
    atomic_write_json(output_paths["transit"], transit_collection, overwrite, repository_root)
    atomic_write_json(output_paths["study_area"], study_collection, overwrite, repository_root)
    atomic_write_json(output_paths["routing_extent"], routing_collection, overwrite, repository_root)
    atomic_write_json(output_paths["culinary"], culinary_collection, overwrite, repository_root)
    atomic_write_csv(output_paths["review"], review, overwrite, repository_root)
    atomic_write_text(output_paths["data_dictionary"], DATA_DICTIONARY, overwrite, repository_root)

    if sha256_file(transit_path) != transit_hash_before or sha256_file(culinary_path) != culinary_hash_before:
        raise ValidationError("Raw input hash changed during processing")
    diagnostics = {
        "analysis_version": ANALYSIS_VERSION,
        "raw_transit_activity_count": len(activities),
        "canonical_matched_stop_count": len(selected_stops),
        "missing_canonical_stop_ids": [],
        "raw_culinary_count": culinary_diagnostics["raw_culinary_count"],
        "p0_culinary_count": culinary_diagnostics["p0_culinary_count"],
        "invalid_culinary_geometry_count": culinary_diagnostics["invalid_geometry_count"],
        "unnamed_culinary_excluded_count": culinary_diagnostics["unnamed_excluded_count"],
        "culinary_coordinate_comparison": {
            "comparable": culinary_diagnostics["coordinate_comparable_count"],
            "missing_or_malformed": culinary_diagnostics["coordinate_missing_or_malformed_count"],
            "mismatch": culinary_diagnostics["coordinate_mismatch_count"],
            "max_longitude_delta": culinary_diagnostics["max_longitude_delta"],
            "max_latitude_delta": culinary_diagnostics["max_latitude_delta"],
        },
        "culinary_null_counts": culinary_diagnostics["null_counts"],
        "culinary_blank_counts": culinary_diagnostics["blank_counts"],
        "raw_hashes": {transit_source_file: transit_hash_before, culinary_source_file: culinary_hash_before},
        "outputs": {key: display_path(value, repository_root) for key, value in output_paths.items()},
    }
    return diagnostics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transit", required=True, type=Path)
    parser.add_argument("--culinary", required=True, type=Path)
    parser.add_argument("--analysis-version", default=ANALYSIS_VERSION)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--data-dictionary", required=True, type=Path)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.analysis_version != ANALYSIS_VERSION:
        print(f"analysis_version must be {ANALYSIS_VERSION}", file=sys.stderr)
        return 2
    try:
        diagnostics = run_pipeline(
            args.transit, args.culinary, args.output_root, args.data_dictionary, args.overwrite, Path.cwd()
        )
    except ValidationError as exc:
        print(f"PHASE-01 validation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(diagnostics, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
