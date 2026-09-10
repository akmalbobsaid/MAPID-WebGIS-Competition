from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import csv
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts" / "spatial"))

import p0_ingestion as p0  # noqa: E402


TRANSIT_PATH = REPOSITORY_ROOT / "data" / "raw" / "transit" / "SurveiActivities.GeoJSON"
CULINARY_PATH = (
    REPOSITORY_ROOT / "data" / "raw" / "culinary" / "MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson"
)


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class P0IngestionTests(unittest.TestCase):
    def test_merchant_uuid_is_stable_and_normalizes_unicode_whitespace(self) -> None:
        first = p0.merchant_uuid("  Café\u00a0Rujak ", 112.70000004, -7.20000004)
        second = p0.merchant_uuid("cafe\u0301 rujak", "112.7000000", "-7.2000000")
        self.assertEqual(first, second)
        self.assertEqual(p0.RUJAK_MERCHANT_NAMESPACE, p0.uuid.UUID("c7e6bb16-9db1-560a-aa6b-781ebf8990be"))
        with self.assertRaises(p0.ValidationError):
            p0.merchant_uuid(" \t", 112.7, -7.2)

    def test_actual_transit_records_match_master_guide_fixture(self) -> None:
        activities = p0.load_survey_activities(TRANSIT_PATH)
        selected = p0.select_p0_stops(activities)
        self.assertEqual(len(activities), 217)
        self.assertEqual([activity["_id"] for _, activity in selected], list(p0.P0_STOP_IDS))
        for baseline, (_, activity) in zip(p0.P0_STOP_BASELINES, selected, strict=True):
            point = p0.validate_point_geometry(activity["geometry"], baseline.stop_id)
            self.assertLessEqual(abs(point.x - baseline.longitude), p0.TRANSIT_BASELINE_TOLERANCE)
            self.assertLessEqual(abs(point.y - baseline.latitude), p0.TRANSIT_BASELINE_TOLERANCE)

    def test_metric_area_construction_covers_stops_and_routing_extent(self) -> None:
        selected = p0.select_p0_stops(p0.load_survey_activities(TRANSIT_PATH))
        study_area, routing_extent = p0.build_p0_areas(selected)
        self.assertTrue(study_area.is_valid)
        self.assertTrue(routing_extent.is_valid)
        self.assertTrue(routing_extent.covers(study_area))
        for _, activity in selected:
            point = p0.validate_point_geometry(activity["geometry"], activity["_id"])
            self.assertTrue(study_area.covers(p0.to_metric(point)))

    def test_end_to_end_is_deterministic_and_preserves_raw_inputs(self) -> None:
        transit_before = file_hash(TRANSIT_PATH)
        culinary_before = file_hash(CULINARY_PATH)
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            output_root = temporary_root / "data"
            dictionary = temporary_root / "docs" / "data" / "P0_DATA_DICTIONARY.md"
            first = p0.run_pipeline(
                TRANSIT_PATH, CULINARY_PATH, output_root, dictionary, True, REPOSITORY_ROOT
            )
            output_files = sorted(path for path in temporary_root.rglob("*") if path.is_file())
            first_hashes = {path.relative_to(temporary_root).as_posix(): file_hash(path) for path in output_files}
            second = p0.run_pipeline(
                TRANSIT_PATH, CULINARY_PATH, output_root, dictionary, True, REPOSITORY_ROOT
            )
            second_files = sorted(path for path in temporary_root.rglob("*") if path.is_file())
            second_hashes = {path.relative_to(temporary_root).as_posix(): file_hash(path) for path in second_files}

            self.assertEqual(first_hashes, second_hashes)
            self.assertEqual(first["raw_transit_activity_count"], 217)
            self.assertEqual(first["canonical_matched_stop_count"], 9)
            self.assertGreater(first["p0_culinary_count"], 0)
            self.assertEqual(first, second)

            transit_output = json.loads((output_root / "processed" / "p0" / "transit_points_p0.geojson").read_text(encoding="utf-8"))
            culinary_output = json.loads((output_root / "processed" / "p0" / "culinary_poi_p0.geojson").read_text(encoding="utf-8"))
            review_csv = (output_root / "interim" / "access_quality_p0_review.csv").read_text(encoding="utf-8")
            self.assertEqual(len(transit_output["features"]), 9)
            self.assertEqual(len(culinary_output["features"]), first["p0_culinary_count"])
            raw_stops = p0.select_p0_stops(p0.load_survey_activities(TRANSIT_PATH))
            self.assertEqual(
                [feature["geometry"]["coordinates"] for feature in transit_output["features"]],
                [activity["geometry"]["coordinates"] for _, activity in raw_stops],
            )
            self.assertTrue(all(
                feature["properties"]["source"] == p0.TRANSIT_SOURCE
                and feature["properties"]["validation_status"] == p0.VALIDATION_STATUS
                and feature["properties"]["scope"] == p0.TRANSIT_SCOPE
                for feature in transit_output["features"]
            ))
            self.assertTrue(all(feature["properties"]["merchant_name"].strip() for feature in culinary_output["features"]))
            self.assertTrue(all(
                feature["properties"]["source"] == p0.CULINARY_SOURCE
                and feature["properties"]["validation_status"] == p0.VALIDATION_STATUS
                for feature in culinary_output["features"]
            ))
            self.assertNotIn(
                "HALTE DI KOTA SURABAYA TAHUN 2025.geojson",
                json.dumps({"t": transit_output, "c": culinary_output, "r": review_csv}),
            )
            self.assertIn("review_status", review_csv)
            self.assertEqual(review_csv.count(",pending,"), 9)
            review_rows = list(csv.DictReader(review_csv.splitlines()))
            self.assertTrue(all(row["review_status"] == "pending" for row in review_rows))
            self.assertTrue(all(not row["approved_shelter"] and not row["reviewed_by"] for row in review_rows))

        self.assertEqual(file_hash(TRANSIT_PATH), transit_before)
        self.assertEqual(file_hash(CULINARY_PATH), culinary_before)


if __name__ == "__main__":
    unittest.main()
