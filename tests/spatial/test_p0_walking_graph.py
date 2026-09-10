from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

from shapely.geometry import Polygon


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts" / "spatial"))

import p0_walking_graph as graph  # noqa: E402
from p0_ingestion import to_metric  # noqa: E402


ROADS_PATH = REPOSITORY_ROOT / "data" / "raw" / "network" / "Jaringan Jalan Surabaya.geojson"
EXTENT_PATH = REPOSITORY_ROOT / "data" / "processed" / "p0" / "routing_processing_extent.geojson"
STUDY_PATH = REPOSITORY_ROOT / "data" / "processed" / "p0" / "study_area_p0.geojson"
TRANSIT_PATH = REPOSITORY_ROOT / "data" / "processed" / "p0" / "transit_points_p0.geojson"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def road_feature(osm_id: int, highway: str, lines: list[list[list[float]]], **properties: object) -> dict[str, object]:
    return {
        "type": "Feature",
        "properties": {"osm_id": osm_id, "highway": highway, **properties},
        "geometry": {"type": "MultiLineString", "coordinates": lines},
    }


def extent_metric() -> object:
    return to_metric(Polygon(((112.739, -7.262), (112.742, -7.262), (112.742, -7.258), (112.739, -7.258))))


class P0WalkingGraphTests(unittest.TestCase):
    def test_shared_vertices_connect_but_crossings_do_not(self) -> None:
        shared = [
            road_feature(1, "residential", [[[112.740, -7.260], [112.7405, -7.260], [112.741, -7.260]]]),
            road_feature(2, "residential", [[[112.7405, -7.2605], [112.7405, -7.260], [112.7405, -7.2595]]]),
        ]
        shared_result = graph.build_graph_from_features(shared, extent_metric(), "road-hash")
        self.assertEqual(shared_result.diagnostics["connected_component_count"], 1)
        self.assertEqual(shared_result.diagnostics["generated_edge_count"], 4)

        crossing = [
            road_feature(3, "residential", [[[112.740, -7.260], [112.741, -7.260]]]),
            road_feature(4, "residential", [[[112.7405, -7.2605], [112.7405, -7.2595]]], bridge="yes", layer="1"),
        ]
        crossing_result = graph.build_graph_from_features(crossing, extent_metric(), "road-hash")
        self.assertEqual(crossing_result.diagnostics["connected_component_count"], 2)
        self.assertEqual(crossing_result.diagnostics["generated_node_count"], 4)

    def test_filter_parallel_edges_and_oneway_semantics(self) -> None:
        features = [
            road_feature(10, "residential", [[[112.740, -7.260], [112.741, -7.260]]], oneway="yes"),
            road_feature(11, "residential", [[[112.740, -7.260], [112.741, -7.260]]]),
            road_feature(12, "cycleway", [[[112.740, -7.261], [112.741, -7.261]]]),
            road_feature(13, "trunk", [[[112.740, -7.259], [112.741, -7.259]]]),
        ]
        result = graph.build_graph_from_features(features, extent_metric(), "road-hash")
        self.assertEqual(result.diagnostics["generated_edge_count"], 2)
        self.assertEqual(result.diagnostics["observed_non_allowlisted_highway_categories"], {"cycleway": 1})
        self.assertEqual(result.diagnostics["frozen_excluded_highway_categories"], {"trunk": 1})
        self.assertEqual(result.edges[0].properties["oneway"], "yes")
        self.assertTrue(all(edge.source_node < edge.target_node for edge in result.edges))
        self.assertEqual(len({edge.edge_id for edge in result.edges}), 2)

    def test_clip_boundary_provenance_does_not_connect(self) -> None:
        extent = to_metric(Polygon(((112.7405, -7.260), (112.742, -7.260), (112.742, -7.258), (112.7405, -7.258))))
        features = [
            road_feature(20, "residential", [[[112.7400, -7.2605], [112.7410, -7.2595]]]),
            road_feature(21, "residential", [[[112.7395, -7.2610], [112.7415, -7.2590]]]),
        ]
        result = graph.build_graph_from_features(features, extent, "road-hash")
        self.assertEqual(result.diagnostics["connected_component_count"], 2)
        self.assertGreaterEqual(result.diagnostics["co_located_clip_boundary_coordinate_count"], 1)

    def test_canonical_pipeline_is_deterministic_and_preserves_inputs(self) -> None:
        before = {path: file_hash(path) for path in (ROADS_PATH, EXTENT_PATH, STUDY_PATH, TRANSIT_PATH)}
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "data"
            diagnostic = output_root / "interim" / "p0" / "pedestrian_graph_coverage_diagnostic.html"
            first = graph.run_pipeline(
                ROADS_PATH, EXTENT_PATH, STUDY_PATH, TRANSIT_PATH, output_root, diagnostic, True, REPOSITORY_ROOT,
            )
            first_hashes = {
                path.relative_to(root).as_posix(): file_hash(path)
                for path in sorted(root.rglob("*")) if path.is_file()
            }
            second = graph.run_pipeline(
                ROADS_PATH, EXTENT_PATH, STUDY_PATH, TRANSIT_PATH, output_root, diagnostic, True, REPOSITORY_ROOT,
            )
            second_hashes = {
                path.relative_to(root).as_posix(): file_hash(path)
                for path in sorted(root.rglob("*")) if path.is_file()
            }
            self.assertEqual(first_hashes, second_hashes)
            self.assertEqual(first, second)
            self.assertGreater(first["generated_node_count"], 0)
            self.assertGreater(first["generated_edge_count"], 0)
            self.assertEqual(first["observed_non_allowlisted_highway_categories"], {"cycleway": 1})
            self.assertIn("pedestrian_graph_coverage_diagnostic.html", first["outputs"]["coverage_diagnostic"])
            nodes = json.loads((output_root / "processed" / "p0" / "pedestrian_nodes.geojson").read_text(encoding="utf-8"))
            edges = json.loads((output_root / "processed" / "p0" / "pedestrian_edges.geojson").read_text(encoding="utf-8"))
            diagnostic_text = diagnostic.read_text(encoding="utf-8")
            self.assertEqual(len(nodes["features"]), first["generated_node_count"])
            self.assertEqual(len(edges["features"]), first["generated_edge_count"])
            self.assertEqual(diagnostic_text.count('data-stop-id='), 9)
            self.assertTrue(all(feature["properties"]["highway"] in graph.INCLUDE_HIGHWAYS for feature in edges["features"]))

        self.assertEqual(before, {path: file_hash(path) for path in before})


if __name__ == "__main__":
    unittest.main()
