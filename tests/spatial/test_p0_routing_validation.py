from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, mapping


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts" / "spatial"))

import p0_routing_validation as routing  # noqa: E402


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def feature(point: Point, properties: dict[str, object]) -> dict[str, object]:
    return {"type": "Feature", "geometry": mapping(point), "properties": properties}


def collection(name: str, features: list[dict[str, object]], **metadata: object) -> dict[str, object]:
    return {"type": "FeatureCollection", "metadata": {"analysis_version": "p0-central-v1", "output_crs": "EPSG:4326", "output_name": name, **metadata}, "features": features}


class P0RoutingValidationTests(unittest.TestCase):
    def test_equal_distance_tie_and_snap_too_far_keep_nearest_diagnostics(self) -> None:
        transformer = Transformer.from_crs(routing.WEB_CRS, routing.METRIC_CRS, always_xy=True)
        x, y = transformer.transform(112.74, -7.26)
        node_a = routing.Node("node_a", x - 10, y, "cc_1", Point(112.73991, -7.26))
        node_b = routing.Node("node_b", x + 10, y, "cc_1", Point(112.74009, -7.26))
        target = routing.Target("merchant_a", "Merchant", Point(112.74, -7.26), {})
        tie = routing.snap_target(target, {"node_b": node_b, "node_a": node_a}, transformer, 30)
        self.assertEqual(tie.node_id, "node_a")
        self.assertEqual(tie.routing_status, "routable")
        too_far = routing.snap_target(target, {"node_b": node_b, "node_a": node_a}, transformer, 5)
        self.assertEqual(too_far.routing_status, "snap_too_far")
        self.assertEqual(too_far.node_id, "node_a")
        self.assertIsNotNone(too_far.snap_distance_m)

    def test_source_specific_disconnected_does_not_change_generic_snap_status(self) -> None:
        target = routing.Target("merchant_a", "Merchant", Point(112.74, -7.26), {})
        primary = routing.Snap(routing.Target(routing.PRIMARY_STOP_ID, "Primary", Point(112.74, -7.26), {}), "node_a", 3.0, "cc_1", "routable", 30)
        merchant = routing.Snap(target, "node_b", 4.0, "cc_2", "routable", 50)
        record = routing.route_record(merchant, primary, {"node_a": 0.0}, {"node_a": ["node_a"]})
        self.assertEqual(record["routing_status"], "routable")
        self.assertEqual(record["primary_route_status"], "disconnected")
        self.assertIsNone(record["total_distance_m"])

    def test_changed_threshold_guard_requires_final_threshold_rerun(self) -> None:
        self.assertEqual(routing.phase03_readiness_state("proposed-change", True), "partial-pending-chatgpt-threshold-review")
        self.assertEqual(routing.phase03_readiness_state("final-threshold-rerun", False), "pending-manual-spatial-review")
        self.assertEqual(routing.phase03_readiness_state("final-threshold-rerun", True), "ready-for-go-next")

    def test_pipeline_writes_interim_only_and_preserves_disconnected_relationship(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            processed, interim = root / "data" / "processed" / "p0", root / "data" / "interim" / "p0"
            transformer = Transformer.from_crs(routing.WEB_CRS, routing.METRIC_CRS, always_xy=True)
            points = [Point(112.7400, -7.2600), Point(112.7401, -7.2600), Point(112.7420, -7.2600), Point(112.7421, -7.2600)]
            metric = [transformer.transform(point.x, point.y) for point in points]
            stop_features = []
            for index in range(9):
                stop_id = routing.PRIMARY_STOP_ID if index == 0 else f"stop_{index}"
                stop_features.append(feature(points[0], {"stop_id": stop_id, "stop_name": stop_id}))
            write_json(processed / "transit.geojson", collection("transit_points_p0", stop_features))
            write_json(processed / "merchant.geojson", collection("culinary_poi_p0", [feature(points[1], {"merchant_id": "merchant_same", "merchant_name": "Same"}), feature(points[3], {"merchant_id": "merchant_other", "merchant_name": "Other"})]))
            node_features = []
            for index, point in enumerate(points):
                node_features.append(feature(point, {"node_id": f"n{index}", "component_id": "cc_1" if index < 2 else "cc_2", "x_m": metric[index][0], "y_m": metric[index][1]}))
            write_json(processed / "nodes.geojson", collection("pedestrian_nodes", node_features, metric_crs="EPSG:32749", graph_type="undirected_multigraph"))
            edge_features = []
            for number, left, right in ((0, 0, 1), (1, 2, 3)):
                length = ((metric[left][0] - metric[right][0]) ** 2 + (metric[left][1] - metric[right][1]) ** 2) ** 0.5
                edge_features.append({"type": "Feature", "geometry": mapping(LineString((points[left], points[right]))), "properties": {"edge_id": f"e{number}", "source_node": f"n{left}", "target_node": f"n{right}", "length_m": length, "cost_seconds": length / 1.3}})
            write_json(processed / "edges.geojson", collection("pedestrian_edges", edge_features, metric_crs="EPSG:32749", graph_type="undirected_multigraph"))
            result = routing.run_pipeline(processed / "transit.geojson", processed / "merchant.geojson", processed / "nodes.geojson", processed / "edges.geojson", interim, overwrite=True, repository_root=root)
            self.assertEqual(result["phase03_readiness"], "pending-manual-spatial-review")
            self.assertTrue((interim / "phase03_stop_snaps_baseline.geojson").is_file())
            self.assertFalse((root / "data" / "processed" / "p0" / "stop_snaps_p0.geojson").exists())
            routes = json.loads((interim / "phase03_halte_simpang_dukuh_vertical_slice.json").read_text(encoding="utf-8"))["routes"]
            disconnected = next(item for item in routes if item["merchant_id"] == "merchant_other")
            self.assertEqual(disconnected["routing_status"], "routable")
            self.assertEqual(disconnected["primary_route_status"], "disconnected")
            rerun = routing.run_pipeline(processed / "transit.geojson", processed / "merchant.geojson", processed / "nodes.geojson", processed / "edges.geojson", interim, analysis_version="p0-central-v2", stop_threshold_m=31, merchant_threshold_m=51, threshold_state="final-threshold-rerun", overwrite=True, repository_root=root)
            self.assertEqual(rerun["phase03_readiness"], "pending-manual-spatial-review")
            rerun_stops = json.loads((interim / "phase03_stop_snaps_baseline.geojson").read_text(encoding="utf-8"))
            self.assertEqual(rerun_stops["metadata"]["analysis_version"], "p0-central-v2")

    def test_processed_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "data" / "processed").mkdir(parents=True)
            with self.assertRaises(routing.ValidationError):
                routing.ensure_interim_root(root / "data" / "processed" / "p0", root)


if __name__ == "__main__":
    unittest.main()
