#!/usr/bin/env python
"""Render static, dependency-free PNG evidence for PHASE-04 isochrone QA."""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform as geometry_transform

from p0_ingestion import ANALYSIS_VERSION, METRIC_CRS, WEB_CRS, ValidationError, atomic_write_json, relative_source_path


WIDTH, HEIGHT, HEADER = 1400, 1000, 96
BACKGROUND = (250, 250, 250)
NETWORK = (135, 145, 155)
ISO_10 = (45, 100, 210)
ISO_5 = (0, 145, 95)
CONNECTOR = (230, 105, 30)
ORIGIN = (210, 35, 35)
SNAPPED_NODE = (20, 20, 20)
TEXT = (15, 25, 40)

# Compact 5x7 uppercase/digit font; names are rendered uppercase for legibility.
FONT = {
    " ": ("00000",) * 7,
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "11100"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00001", "00001", "00001", "00001", "10001", "10001", "01110"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
}


def read(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Cannot read {path}: {exc}") from exc


def set_pixel(canvas: bytearray, x: int, y: int, color: tuple[int, int, int]) -> None:
    if 0 <= x < WIDTH and 0 <= y < HEIGHT:
        index = (y * WIDTH + x) * 3
        canvas[index:index + 3] = bytes(color)


def draw_line(canvas: bytearray, start: tuple[int, int], end: tuple[int, int], color: tuple[int, int, int], width: int = 1) -> None:
    x0, y0 = start
    x1, y1 = end
    dx, sx = abs(x1 - x0), 1 if x0 < x1 else -1
    dy, sy = -abs(y1 - y0), 1 if y0 < y1 else -1
    error = dx + dy
    while True:
        radius = width // 2
        for offset_x in range(-radius, radius + 1):
            for offset_y in range(-radius, radius + 1):
                set_pixel(canvas, x0 + offset_x, y0 + offset_y, color)
        if x0 == x1 and y0 == y1:
            return
        twice = 2 * error
        if twice >= dy:
            error += dy
            x0 += sx
        if twice <= dx:
            error += dx
            y0 += sy


def draw_circle(canvas: bytearray, center: tuple[int, int], radius: int, color: tuple[int, int, int]) -> None:
    cx, cy = center
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
                set_pixel(canvas, x, y, color)


def draw_text(canvas: bytearray, text: str, x: int, y: int, scale: int = 2) -> None:
    cursor = x
    for char in text.upper():
        glyph = FONT.get(char, FONT[" "])
        for row, bits in enumerate(glyph):
            for column, bit in enumerate(bits):
                if bit == "1":
                    for yy in range(scale):
                        for xx in range(scale):
                            set_pixel(canvas, cursor + column * scale + xx, y + row * scale + yy, TEXT)
        cursor += 6 * scale


def png_bytes(canvas: bytearray) -> bytes:
    def chunk(name: bytes, value: bytes) -> bytes:
        return struct.pack(">I", len(value)) + name + value + struct.pack(">I", zlib.crc32(name + value) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + bytes(canvas[row * WIDTH * 3:(row + 1) * WIDTH * 3]) for row in range(HEIGHT))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def write_png(path: Path, canvas: bytearray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(canvas))


def render_stop(
    stop_feature: dict[str, Any], snap_feature: dict[str, Any], iso5: Any, iso10: Any,
    edge_geometries: list[Any], node_points: dict[str, Point], to_metric: Transformer,
    output_path: Path,
) -> None:
    origin = geometry_transform(to_metric.transform, shape(stop_feature["geometry"]))
    snapped = node_points[snap_feature["properties"]["node_id"]]
    iso5_metric, iso10_metric = geometry_transform(to_metric.transform, iso5), geometry_transform(to_metric.transform, iso10)
    min_x, min_y, max_x, max_y = iso10_metric.bounds
    pad = max(120.0, 0.08 * max(max_x - min_x, max_y - min_y))
    min_x, min_y, max_x, max_y = min_x - pad, min_y - pad, max_x + pad, max_y + pad
    scale_x, scale_y = (WIDTH - 40) / (max_x - min_x), (HEIGHT - HEADER - 30) / (max_y - min_y)
    scale = min(scale_x, scale_y)
    offset_x = 20 + ((WIDTH - 40) - (max_x - min_x) * scale) / 2
    offset_y = HEADER + 15 + ((HEIGHT - HEADER - 30) - (max_y - min_y) * scale) / 2
    def pixel(coord: tuple[float, float]) -> tuple[int, int]:
        return (round(offset_x + (coord[0] - min_x) * scale), round(offset_y + (max_y - coord[1]) * scale))
    canvas = bytearray(BACKGROUND * (WIDTH * HEIGHT))
    for line in edge_geometries:
        metric = geometry_transform(to_metric.transform, line)
        if metric.bounds[2] < min_x or metric.bounds[0] > max_x or metric.bounds[3] < min_y or metric.bounds[1] > max_y:
            continue
        coords = list(metric.coords)
        for left, right in zip(coords, coords[1:]):
            draw_line(canvas, pixel(left), pixel(right), NETWORK, 1)
    def outline(geometry: Any, color: tuple[int, int, int], width: int) -> None:
        polygons = [geometry] if geometry.geom_type == "Polygon" else list(geometry.geoms)
        for polygon in polygons:
            for ring in [polygon.exterior, *polygon.interiors]:
                coords = list(ring.coords)
                for left, right in zip(coords, coords[1:]):
                    draw_line(canvas, pixel(left), pixel(right), color, width)
    outline(iso10_metric, ISO_10, 3)
    outline(iso5_metric, ISO_5, 3)
    draw_line(canvas, pixel((origin.x, origin.y)), pixel((snapped.x, snapped.y)), CONNECTOR, 3)
    draw_circle(canvas, pixel((snapped.x, snapped.y)), 5, SNAPPED_NODE)
    draw_circle(canvas, pixel((origin.x, origin.y)), 7, ORIGIN)
    props = stop_feature["properties"]
    draw_text(canvas, f"{props['stop_id']} - {props['stop_name']}", 20, 18, 2)
    draw_text(canvas, "GRAY NETWORK  BLUE 10 MIN  GREEN 5 MIN  ORANGE CONNECTOR  RED ORIGIN", 20, 48, 1)
    write_png(output_path, canvas)


def run(transit: Path, stop_snaps: Path, nodes: Path, edges: Path, isochrones: Path, output_dir: Path, manifest: Path, repository_root: Path) -> dict[str, Any]:
    transit_doc, snaps_doc, nodes_doc, edges_doc, iso_doc = (read(path) for path in (transit, stop_snaps, nodes, edges, isochrones))
    if iso_doc.get("metadata", {}).get("analysis_version") != ANALYSIS_VERSION:
        raise ValidationError("Isochrone analysis version is not frozen P0 version")
    snaps = {item["properties"]["stop_id"]: item for item in snaps_doc["features"]}
    node_points = {item["properties"]["node_id"]: geometry_transform(Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True).transform, shape(item["geometry"])) for item in nodes_doc["features"]}
    iso = {(item["properties"]["stop_id"], item["properties"]["duration_min"]): shape(item["geometry"]) for item in iso_doc["features"]}
    edge_geometries = [shape(item["geometry"]) for item in edges_doc["features"]]
    to_metric = Transformer.from_crs(WEB_CRS, METRIC_CRS, always_xy=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for stop in sorted(transit_doc["features"], key=lambda item: item["properties"]["stop_id"]):
        stop_id = stop["properties"]["stop_id"]
        if stop_id not in snaps or (stop_id, 5) not in iso or (stop_id, 10) not in iso:
            raise ValidationError(f"Static QA inputs incomplete for {stop_id}")
        path = output_dir / f"phase04_isochrone_{stop_id}.png"
        render_stop(stop, snaps[stop_id], iso[(stop_id, 5)], iso[(stop_id, 10)], edge_geometries, node_points, to_metric, path)
        records.append({"stop_id": stop_id, "stop_name": stop["properties"]["stop_name"], "validation_artifact_path": relative_source_path(path, repository_root)})
    atomic_write_json(manifest, {"analysis_version": ANALYSIS_VERSION, "artifact_scope": "PHASE-04 static visual QA; manual review required", "renderer": "stdlib_png_vector_renderer_v1", "stops": records}, True, repository_root)
    return {"count": len(records), "manifest": relative_source_path(manifest, repository_root), "paths": records}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transit", type=Path, required=True)
    parser.add_argument("--stop-snaps", type=Path, required=True)
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--isochrones", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = run(args.transit, args.stop_snaps, args.nodes, args.edges, args.isochrones, args.output_dir, args.manifest, Path.cwd())
    except ValidationError as exc:
        print(f"Static QA rendering failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
