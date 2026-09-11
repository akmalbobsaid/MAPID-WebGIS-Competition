from __future__ import annotations

import sys
import unittest
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts" / "spatial"))

import p0_reachability_precompute as phase04  # noqa: E402
import p0_phase04_static_qa as static_qa  # noqa: E402


class P0ReachabilityPrecomputeTests(unittest.TestCase):
    def test_undirected_edge_intervals_cover_each_endpoint_case(self) -> None:
        self.assertEqual(phase04.edge_intervals(100.0, 20.0, None, 50.0), [(0.0, 30.0)])
        self.assertEqual(phase04.edge_intervals(100.0, None, 20.0, 50.0), [(70.0, 100.0)])
        self.assertEqual(phase04.edge_intervals(100.0, 20.0, 30.0, 50.0), [(0.0, 30.0), (80.0, 100.0)])
        self.assertEqual(phase04.edge_intervals(100.0, 20.0, 30.0, 90.0), [(0.0, 100.0)])
        self.assertEqual(phase04.edge_intervals(100.0, 20.0, None, 150.0), [(0.0, 100.0)])

    def test_smaller_budget_is_interval_subset(self) -> None:
        five = phase04.edge_intervals(100.0, 15.0, 40.0, 45.0)
        ten = phase04.edge_intervals(100.0, 15.0, 40.0, 80.0)
        for start, end in five:
            self.assertTrue(any(other_start <= start and end <= other_end for other_start, other_end in ten))

    def test_metric_line_clipping_preserves_both_partial_segments(self) -> None:
        line = LineString(((0, 0), (100, 0)))
        intervals = phase04.edge_intervals(100.0, 20.0, 30.0, 50.0)
        clipped = [phase04.clip_metric_line(line, 100.0, start, end) for start, end in intervals]
        self.assertEqual(len(clipped), 2)
        self.assertAlmostEqual(clipped[0].length, 30.0)
        self.assertAlmostEqual(clipped[1].length, 20.0)

    def test_buffer_bridge_detector_only_flags_distinct_components(self) -> None:
        near_a = LineString(((0, 0), (20, 0)))
        near_b = LineString(((0, 5), (20, 5)))
        self.assertEqual(phase04.detect_component_buffer_bridges([("a", "cc_1", near_a), ("b", "cc_1", near_b)]), ())
        self.assertEqual(phase04.detect_component_buffer_bridges([("a", "cc_1", near_a), ("b", "cc_2", near_b)]), (("a", "b"),))

    def test_polygonal_only_rejects_non_polygonal_geometry(self) -> None:
        with self.assertRaises(phase04.ValidationError):
            phase04.polygonal_only(Point(0, 0))

    def test_metric_nesting_uses_square_metres_and_documented_tolerance(self) -> None:
        outer = Polygon(((0, 0), (1000, 0), (1000, 1000), (0, 1000)))
        inner = Polygon(((0, 0), (1000, 0), (1000, 999.99999995), (0, 999.99999995)))
        excess, tolerance = phase04.metric_nesting_excess_m2(inner, outer)
        self.assertEqual(excess, 0.0)
        self.assertEqual(tolerance, max(1e-4, 1e-9 * inner.area))
        spill = Polygon(((0, 0), (1000, 0), (1000, 1000.001), (0, 1000.001)))
        excess, tolerance = phase04.metric_nesting_excess_m2(spill, outer)
        self.assertGreater(excess, tolerance)

    def test_config_fingerprint_is_stable(self) -> None:
        first, first_fingerprint = phase04.config_fingerprint()
        second, second_fingerprint = phase04.config_fingerprint()
        self.assertEqual(first, second)
        self.assertEqual(first_fingerprint, second_fingerprint)
        self.assertEqual(first["method"], "network_dijkstra_edge_intervals_buffer_v1")

    def test_static_renderer_emits_a_valid_png_signature(self) -> None:
        canvas = bytearray(static_qa.BACKGROUND * (static_qa.WIDTH * static_qa.HEIGHT))
        payload = static_qa.png_bytes(canvas)
        self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
        self.assertIn(b"IHDR", payload)
        self.assertIn(b"IEND", payload)


if __name__ == "__main__":
    unittest.main()
