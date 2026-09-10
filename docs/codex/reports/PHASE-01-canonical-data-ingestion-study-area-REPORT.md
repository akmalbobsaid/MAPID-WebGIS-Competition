# PHASE-01 Implementation Report

## 1. Status

**PASS.** The completed implementation satisfies the approved Phase-01 data, spatial, deterministic-ID, lineage, review-seed, and test acceptance criteria. The audit in this report was run on 2026-09-11 without modifying raw inputs, application code, or Phase-02 scope.

## 2. Scope Implemented

- Implemented the offline Python P0 ingestion CLI for the two immutable canonical inputs.
- Parsed the Survey Activities API wrapper at `data.activities`, selected the nine frozen records only by exact `_id`, and retained their raw Point geometries.
- Validated the nine raw coordinates against the Master Guide Section 3.2 fixture at `0.0000001` degrees.
- Built the P0 study area in EPSG:32749 from the nine-stop convex hull plus 1,000 m and the routing-processing extent as a further 300 m metric buffer; emitted both in EPSG:4326.
- Mapped, validated, deterministically identified, and metric-`covers` clipped culinary POIs.
- Created the nine-row pending Access Quality review seed and P0 data dictionary.
- Added deterministic/unit/integration tests, including a temporary-directory rerun that does not write production output paths.

No road processing, routing, database, API, frontend, AI, or P1 work was implemented.

## 3. Files Added

| Path | Purpose |
| --- | --- |
| `scripts/spatial/requirements.txt` | Pinned Phase-01 spatial dependencies. |
| `scripts/spatial/p0_ingestion.py` | Deterministic ingestion, validation, area construction, lineage, serialization, and CLI. |
| `tests/spatial/test_p0_ingestion.py` | Four Phase-01 validation tests. |
| `docs/data/P0_DATA_DICTIONARY.md` | Actual generated artifact schema and contract documentation. |
| `data/processed/p0/transit_points_p0.geojson` | Nine canonical P0 transit Points. |
| `data/processed/p0/study_area_p0.geojson` | P0 study-area polygon. |
| `data/processed/p0/routing_processing_extent.geojson` | Phase-2 routing-processing extent polygon. |
| `data/processed/p0/culinary_poi_p0.geojson` | Canonical culinary Points covered by the study area. |
| `data/interim/access_quality_p0_review.csv` | Pending nine-stop human review seed. |

## 4. Files Modified

No existing application source, package manifest, environment template, raw input, database file, or migration was modified by the Phase-01 implementation.

The approved Phase-01 plan was created and revised during the preceding planning passes, not changed as part of this implementation audit. The repository-local `.venv-spatial/` environment was created for execution and is ignored by `.gitignore`.

## 5. Data Outputs Generated

| Path | Size | Verified contents |
| --- | ---: | --- |
| `data/processed/p0/transit_points_p0.geojson` | 11,759 bytes | 9 EPSG:4326 Point features. |
| `data/processed/p0/study_area_p0.geojson` | 3,801 bytes | 1 EPSG:4326 polygonal study-area feature. |
| `data/processed/p0/routing_processing_extent.geojson` | 6,386 bytes | 1 EPSG:4326 polygonal routing-extent feature. |
| `data/processed/p0/culinary_poi_p0.geojson` | 298,655 bytes | 355 EPSG:4326 canonical culinary Point features. |
| `data/interim/access_quality_p0_review.csv` | 7,240 bytes | 9 rows, all pending review. |
| `docs/data/P0_DATA_DICTIONARY.md` | 3,334 bytes | Documents generated schemas, CRS, lineage, UUID contract, and review semantics. |

All GeoJSON collection metadata carries `analysis_version = "p0-central-v1"` and `output_crs = "EPSG:4326"`.

## 6. Database Migrations Applied

None. No Supabase/PostGIS project, connection, migration, table, index, seed, or SQL statement was created or executed.

## 7. API / UI Changes

None. The Next.js application, API surface, UI, maps, Leaflet/MAPID integration, and frontend dependencies were not changed.

## 8. Tests Run

The following command was executed in the repository-local spatial environment:

```powershell
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests\spatial -p 'test_*.py' -v
```

Executed tests:

- `test_actual_transit_records_match_master_guide_fixture`
- `test_end_to_end_is_deterministic_and_preserves_raw_inputs`
- `test_merchant_uuid_is_stable_and_normalizes_unicode_whitespace`
- `test_metric_area_construction_covers_stops_and_routing_extent`

The end-to-end test runs the pipeline twice into a temporary directory, compares the resulting file hashes, checks raw input hashes before/after, and does not alter production output paths.

Additional read-only artifact audit code was executed with the same environment. It parsed all generated GeoJSON/CSV files; reconstructed the expected EPSG:32749 study/routing geometries; checked schemas, canonical values, lineage, review values, geometry coverage, raw-geometry preservation, UUID re-derivation, and raw hashes. `python -m pip check` was also run.

## 9. Test Results

| Check | Result | Evidence |
| --- | --- | --- |
| Unit/integration suite | PASS | 4 passed, 0 failed in 1.996 seconds. |
| Deterministic temporary rerun | PASS | Test compared all temporary output SHA-256 values across two runs. |
| Raw immutability in test | PASS | Test calculated SHA-256 before/after its two pipeline runs. |
| Artifact audit | PASS | All boolean checks reported `True`; counts and spatial measurements are in Section 10. |
| Dependency consistency | PASS | `.venv-spatial\Scripts\python.exe -m pip check` returned `No broken requirements found.` |

## 10. Data Quality / Spatial Validation Results

### Transit, CRS, and spatial areas

- Raw Survey Activities count: **217**; P0 output count: **9**.
- All nine required `stop_id` values are present, ordered per the frozen fixture, and unique.
- Every output transit geometry exactly equals the corresponding raw `activity.geometry.coordinates`; no Guide-table coordinates were substituted.
- Master Guide baseline comparison passed: maximum absolute coordinate delta was **2.842170943040401e-14 degrees**, below the `0.0000001`-degree tolerance.
- All output collection CRS metadata values are **EPSG:4326**.
- Independent reconstruction from raw transit Points using EPSG:4326 -> EPSG:32749 -> convex hull -> `buffer(1000, quad_segs=16)` matched the output study area with a Hausdorff distance of **1.979060471057892e-09 m** after web-output reprojection.
- Independent reconstruction of the further 300 m metric buffer matched the output routing extent with the same **1.979060471057892e-09 m** Hausdorff distance after reprojection.
- The routing extent covers the complete study area.

### Culinary, identity, and coverage

- Raw culinary FeatureCollection count: **2,173**; P0 culinary output count: **355**. The latter is diagnostic, not a hard-coded acceptance target.
- All 2,173 raw geometry/`LONGITUDE`/`LATITUDE` pairs were comparable; 0 were missing/malformed and 0 exceeded the `0.000001`-degree tolerance. Maximum observed delta was **5.000000129484761e-07 degrees**.
- All 355 output `merchant_id` values are unique and were deterministically re-derived from the source feature at `source_feature_index`.
- The actual UUIDv5 namespace is **`c7e6bb16-9db1-560a-aa6b-781ebf8990be`**. Geometry `[longitude, latitude]` is the identity source and is normalized to seven decimals in the implementation.
- Every retained canonical `merchant_name` is non-null and non-blank. The ingestion diagnostics recorded 0 unnamed exclusions.
- Every retained culinary Point is covered by the reconstructed metric study area.
- No unsupported price, rating, hours, menu, or enrichment field appears in the canonical culinary schema.

### Canonical fields, review seed, and lineage

- Transit features have `source = "SurveiActivities.GeoJSON"`, `validation_status = "valid"`, and `scope = "p0-central"`.
- Culinary features have `source = "MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson"` and `validation_status = "valid"`.
- Transit and culinary property sets exactly match the implemented canonical field contracts.
- `access_quality_p0_review.csv` has exactly 9 rows; every `review_status` is `pending`; all approved Access Quality fields, `reviewed_by`, `reviewed_at`, and `review_notes` are blank.
- `HALTE DI KOTA SURABAYA TAHUN 2025.geojson` is absent from the serialized processed GeoJSON outputs and review CSV lineage.
- Current raw SHA-256 values equal their persisted output-metadata lineage values and the values recorded before/after the completed implementation run:

| Raw input | SHA-256 |
| --- | --- |
| `data/raw/transit/SurveiActivities.GeoJSON` | `63D5A24D5A74207642A13780254E8897D5D8B39608411474D6A1A83E21DFD398` |
| `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` | `0CDAE67E83D996938967A7A1C72CB2F46C94E15BCD9146E53138BA5D67E925AF` |

The pipeline itself re-hashes both raw files after writing derived outputs and fails if either hash changes. The successful end-to-end test and the current audit both confirm the inputs were unchanged.

## 11. Deviations from Approved Plan

No functional, scope, data-contract, CRS, study-area, ID, lineage, or acceptance-test deviation was found.

One documentation-only discrepancy was identified in the Phase-01 plan's earlier repository finding: it associates the correct SHA-256 values with the raw inputs but reverses their byte-size labels. Actual sizes are 401,736 bytes for `SurveiActivities.GeoJSON` and 1,338,295 bytes for the culinary GeoJSON. This had no effect on input selection, hashes, processing, or output and was not changed during this report-only pass.

The approved requirements pin GeoPandas, Shapely, and pyproj. The implementation uses standard-library JSON/CSV plus Shapely and pyproj directly; GeoPandas remains a pinned and installed approved dependency but is not imported by this P0 script. This is a non-functional implementation simplification with no output or contract deviation.

## 12. Known Limitations

- Git remains unavailable on `PATH`, so Git status, diff statistics, history, and tracked/untracked classification could not be collected.
- The local `.venv-spatial` is intentionally ignored and must be recreated from `scripts/spatial/requirements.txt` on another machine.
- `validation_status = "valid"` is structural/data validation only; it is not human Access Quality approval or routing eligibility.
- The review seed contains raw evidence and blank suggested/approved fields. Human review is a later activity.
- This phase prepares only the routing-processing extent; it does not process the road network or construct routing.

## 13. Bugs / Follow-up

No blocking Phase-01 bug was found.

Follow-up work is intentionally deferred: review and approve Access Quality fields through the human process; then begin Phase-02 planning/implementation only after separate approval to process the road network against `routing_processing_extent.geojson`. Do not alter the fixed merchant namespace or canonical ID contracts without an approved analytical migration.

## 14. Reproduction Commands

The following commands were used or verified for the completed implementation. They must be run from the repository root.

```powershell
# Spatial environment setup
python -m venv .venv-spatial

# Pinned dependency installation
.\.venv-spatial\Scripts\python.exe -m pip install -r scripts\spatial\requirements.txt

# Canonical Phase-01 ingestion (overwrites derived outputs only)
.\.venv-spatial\Scripts\python.exe scripts\spatial\p0_ingestion.py --transit 'data\raw\transit\SurveiActivities.GeoJSON' --culinary 'data\raw\culinary\MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson' --analysis-version p0-central-v1 --output-root data --data-dictionary docs\data\P0_DATA_DICTIONARY.md --overwrite

# Tests and dependency integrity
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests\spatial -p 'test_*.py' -v
.\.venv-spatial\Scripts\python.exe -m pip check

# Raw immutability / lineage check
Get-FileHash -Algorithm SHA256 'data\raw\transit\SurveiActivities.GeoJSON','data\raw\culinary\MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson'
```

## 15. Environment / Configuration Changes

- Created the ignored repository-local `.venv-spatial` using Python 3.13.14.
- Installed the pinned requirements: GeoPandas 1.1.4, Shapely 2.1.2, and pyproj 3.8.0, plus their resolver dependencies.
- No `.env` file, environment template, JavaScript package manifest, database configuration, deployment configuration, or application configuration was changed.

## 16. Security Notes

- No credentials, API keys, database URLs, or secrets were added.
- Processing reads only the two canonical raw files and writes only planned interim/processed/documentation paths; the code rejects output paths under `data/raw/`.
- Raw source SHA-256 values are retained in metadata/feature lineage and verified after processing.
- No stale halte source, CSV concatenation, external scraping, LLM enrichment, or fabricated culinary attribute enters the output lineage.

## 17. Evidence for Definition of Done

| Definition-of-Done requirement | Evidence |
| --- | --- |
| Canonical raw files inspected and unchanged | Current hashes match output metadata and recorded pre/post implementation hashes; in-run and test hash guards pass. |
| Nine exact-ID P0 stops and primary stop retained | 9 output features, ordered/unique frozen IDs, exact raw geometry match, fixture test passes. |
| Master Guide coordinate guard | Max delta `2.842170943040401e-14` degrees, below `0.0000001`; test passes. |
| Metric study/routing construction | Independent EPSG:32749 reconstruction has ~`1.98e-09 m` Hausdorff distance; routing covers study. |
| Canonical culinary data | 355 valid named Point features, all metric-covered; IDs unique and re-derived deterministically. |
| Culinary coordinate guard and namespace | 2,173 comparable, 0 mismatch; max delta ~`5e-07`; UUIDv5 namespace verified. |
| Canonical schemas and versions | Exact transit/culinary property-set checks pass; canonical values and `p0-central-v1` verified. |
| Review seed | 9 pending rows with all approved fields blank. |
| Lineage / stale-source safety | Source filename/hash/index fields verified; stale halte string absent from outputs. |
| Documentation and tests | Data dictionary exists and describes actual schema; 4 tests passed, 0 failed. |
| Out-of-scope work absent | No database, API, UI, routing/network, AI, or P1 changes found. |

## 18. Readiness for Next Phase

Phase-01 is complete and its canonical P0 artifacts are ready for Phase-02 review. The only next authorized technical use is the later, separately approved road-network processing within `data/processed/p0/routing_processing_extent.geojson`. No Phase-02 work was started by this report.
