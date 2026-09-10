# PHASE-01 Plan

## 1. Goal

Plan, but do not implement in this pass, a deterministic offline P0 ingestion workflow that turns the two frozen canonical raw inputs into the Central Surabaya Transit-Culinary Cluster artifacts required by later phases. The planned analysis version is `p0-central-v1`.

**Planning status: READY FOR IMPLEMENTATION REVIEW.** The canonical raw files, the supplied Master Guide Section 3.2 coordinate baseline, source-specific structure, coordinate consistency, and `NAMA` completeness were inspected read-only on 2026-09-11. All nine frozen IDs are present; all nine actual Survey Activities geometries pass the Guide-coordinate comparison; and culinary geometry/property coordinates agree within the source's six-decimal property precision. The implementation must retain the actual Survey Activities geometry and must not replace it with the validation baseline.

The eventual workflow will write only the following derived artifacts:

- `data/processed/p0/study_area_p0.geojson`
- `data/processed/p0/routing_processing_extent.geojson`
- `data/processed/p0/transit_points_p0.geojson`
- `data/processed/p0/culinary_poi_p0.geojson`
- `data/interim/access_quality_p0_review.csv`
- `docs/data/P0_DATA_DICTIONARY.md`

No output, script, dependency, environment, or application change is created by this planning pass.

## 2. In Scope

- Ingesting the immutable Survey Activities wrapper at the frozen transit path and extracting its activity records.
- Selecting exactly the nine frozen P0 records by exact `stop_id`, retaining their raw-survey evidence fields and geometry.
- Ingesting the frozen culinary GeoJSON, mapping its specified attributes, assigning deterministic `merchant_id` values, and retaining only P0 study-area POIs.
- Constructing `study_area_p0` in EPSG:32749 from the nine selected stops using the frozen convex-hull-plus-1,000-metre-buffer method; constructing the 300-metre routing-processing extent in the same metric CRS.
- Producing the pending human-review seed CSV and P0 data dictionary.
- Reproducibility, validation, diagnostics, raw-lineage, and failure-reporting behavior for those artifacts.

## 3. Explicitly Out of Scope

This phase does not plan or authorize walking graph construction, road-network/highway filtering, Dijkstra, stop/merchant snapping, distance or walking-time computation, isochrones, PostGIS work, backend APIs, frontend/MAPID UI work, AGUS AI, access-quality approval, price/rating/hours filtering, live/current-location/multimodal routing, 15-minute catchments, KDE, Potential Accessibility Gap, recommendation scoring, or any P1 feature.

`routing_processing_extent.geojson` is in scope only as a derived boundary for Phase-2. Processing roads with it is explicitly Phase-2 work.

## 4. Current Repository Findings

### Facts observed during this planning pass

- The repository is a compact Phase-0 scaffold: root `README.md`, `.gitignore`, `.env.example`, `data/`, `docs/`, and one Next.js application at `apps/web`.
- `apps/web/package.json` uses npm scripts (`dev`, `lint`, `build`, `start`), Next.js `16.3.4`, React `19.2.8`, TypeScript, and Node `24.x` / npm `>=11.0.0`. Its source remains the generated smoke-test shell; it has no data-processing or spatial code.
- There is no `scripts/`, Python package/configuration, `.venv-spatial`, spatial requirements file, test directory, or test framework in the repository. No existing data utility was found.
- `data/raw/transit/SurveiActivities.GeoJSON` (1,338,295 bytes, SHA-256 `63D5A24D5A74207642A13780254E8897D5D8B39608411474D6A1A83E21DFD398`) and `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` (401,736 bytes, SHA-256 `0CDAE67E83D996938967A7A1C72CB2F46C94E15BCD9146E53138BA5D67E925AF`) are now immutable canonical inputs. `data/interim/` and `data/processed/` remain marker-only; no derived artifact exists.
- `.gitignore` deliberately does not blanket-ignore `data/interim` or `data/processed`; it ignores only data caches, partial files, backups, and GeoPackage sidecars. `.env.example` contains only comments and empty future placeholders.
- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` and `docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md` were read. They freeze Python 3.13, a repository-local `.venv-spatial`, future `scripts/spatial/requirements.txt`, raw/API/web EPSG:4326, metric EPSG:32749, the P0 study-area formula, the primary demo stop, and `analysis_version = "p0-central-v1"`.
- Phase-0 recorded resolver evidence for GeoPandas 1.1.4, Shapely 2.1.2, pyproj 3.8.0, and NetworkX 3.6.1 on Python 3.13/Windows. It did not create the environment or install any of them. NetworkX is not needed in Phase-1.
- A `.git` directory now exists, but the `git` executable is unavailable on `PATH`; therefore current status and history could not be read in this pass. This repeats the practical Git-tooling limitation documented by Phase-0, while accurately noting the current `.git` directory.

### Binding Phase-0 decisions

- Canonical transit source is Survey Activities, never the 2025 halte GeoJSON.
- Raw/API/web coordinates are EPSG:4326. Metric spatial work is EPSG:32749.
- `study_area_p0` is precisely the nine P0 stops' convex hull buffered 1,000 metres in EPSG:32749. The routing-processing extent is that result plus 300 metres in EPSG:32749.
- The primary demo stop remains `6a92c77152d86e03b51db962` / Halte Simpang Dukuh.

### Planning consequence

The repository has no pre-existing Python layout to preserve. The small `scripts/spatial/` and `tests/spatial/` addition proposed below follows the Phase-0 frozen runtime convention rather than introducing a service, notebook, database, or application integration.

## 5. Source Files / Data Inputs

### Observed Survey Activities source

`data/raw/transit/SurveiActivities.GeoJSON` is a JSON API wrapper, not a GeoJSON FeatureCollection. Its top-level members are `success` (`true`), `message` (the API success text), `data`, and `meta`; it has no legacy `crs` member. The activity collection is the 217-element array at the exact path `data.activities`. `data` contains only `activities`; `meta` contains `filters` and `total`, whose observed value is `217`.

Every one of the 217 activities has all required mapping keys and none is null: `_id`, `title`, `description`, `geometry`, `created_at`, `user_name`, and `medias`. The observed union of activity keys is `_id`, `title`, `description`, `geometry`, `medias`, `total_comment`, `created_at`, `likes`, `user_name`, `user_full_name`, `user_profile_picture`, `community_name`, `community_picture`, and `community_description`. All 217 geometries are GeoJSON objects with `type: "Point"` and two-element `[longitude, latitude]` coordinate arrays. Their observed range is longitude `112.6009821`–`112.805619645199`, latitude `-7.35213967892219`–`-7.1993333`, which is plausible Surabaya WGS84 data and consistent with the frozen EPSG:4326 contract.

The nine frozen IDs are all present exactly once, in the following observed raw geometries:

| `stop_id` | Observed raw title | Observed raw `[longitude, latitude]` | Guide §3.2 `[longitude, latitude]` | Comparison |
| --- | --- | --- | --- | --- |
| `6a94322752d86e03b51f0365` | Halte Pemuda RRI | `[112.74765890000003, -7.2652738]` | `[112.7476589, -7.2652738]` | Pass; float delta only |
| `6a94304b52d86e03b51efc92` | Bus Stop Grand City | `[112.75032809999999, -7.2629196]` | `[112.7503281, -7.2629196]` | Pass; float delta only |
| `6a942f5e52d86e03b51efa52` | Bus Stop Balai Kota A | `[112.74795169999999, -7.2609883]` | `[112.7479517, -7.2609883]` | Pass; float delta only |
| `6a92c82852d86e03b51dbb58` | Halte Pangsud | `[112.7449579, -7.2664402]` | `[112.7449579, -7.2664402]` | Pass |
| `6a92c77152d86e03b51db962` | Halte Simpang Dukuh | `[112.7419137, -7.2630167]` | `[112.7419137, -7.2630167]` | Pass |
| `6a92c6ad52d86e03b51db794` | Bus Stop Tunjungan | `[112.7392791, -7.2598872]` | `[112.7392791, -7.2598872]` | Pass; float delta only |
| `6a92c5e152d86e03b51db51f` | Bus Stop Siola | `[112.7378236, -7.2573828]` | `[112.7378236, -7.2573828]` | Pass |
| `6a92b2233f59e23bb862c962` | Halte Embong Malang | `[112.7374723, -7.2605207]` | `[112.7374723, -7.2605207]` | Pass |
| `6a92b1273f59e23bb862c863` | Halte Kaliasin | `[112.74096, -7.2647]` | `[112.7409600, -7.2647000]` | Pass; equivalent decimal precision |

The supplied Master Technical Implementation Guide Section 3.2 baseline matches all nine observed raw coordinates. The maximum observed absolute longitude delta is `2.8421709430404e-14` degrees and the maximum latitude delta is `0`; these are ordinary binary floating-point representations of the same decimal values (for example, raw `112.75032809999999` equals baseline `112.7503281` for this validation). The comparison therefore **passes** at the planned `0.0000001`-degree tolerance, with no discrepancy or longitude/latitude reversal observed. The Guide table is a validation reference only: canonical transit geometry remains the actual `activity.geometry` from Survey Activities, without coordinate replacement or snapping.

For every usable activity, the planned canonical mapping is:

| Actual activity member expected by the frozen contract | Canonical P0 transit field |
| --- | --- |
| `_id` | `stop_id` |
| `title` | `stop_name` (display only) |
| `geometry` | GeoJSON geometry |
| `description` | `description_raw` |
| `created_at` | `surveyed_at` |
| `user_name` | `surveyor` |
| `medias` | `media` |

The implementation must assert this observed wrapper shape and fail on a material drift (no `data.activities`, an incompatible activity object, missing `_id`, or incompatible Point geometry). `stop_id` is the only selection key; no title-based, fuzzy, normalized-name, or position-based matching is permitted.

The exact required IDs, in the output's deterministic ordering, are:

1. `6a94322752d86e03b51f0365` — Halte Pemuda RRI
2. `6a94304b52d86e03b51efc92` — Bus Stop Grand City
3. `6a942f5e52d86e03b51efa52` — Bus Stop Balai Kota A
4. `6a92c82852d86e03b51dbb58` — Halte Pangsud
5. `6a92c77152d86e03b51db962` — Halte Simpang Dukuh
6. `6a92c6ad52d86e03b51db794` — Bus Stop Tunjungan
7. `6a92c5e152d86e03b51db51f` — Bus Stop Siola
8. `6a92b2233f59e23bb862c962` — Halte Embong Malang
9. `6a92b1273f59e23bb862c863` — Halte Kaliasin

### Observed culinary source

`data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` is a top-level GeoJSON `FeatureCollection` with exactly 2,173 features and no legacy `crs` member. All 2,173 features have `type: "Feature"`, a Point geometry, and two-element coordinates. Geometry longitude ranges from `112.6035542` to `112.814909`; latitude ranges from `-7.34989189999994` to `-7.1962925`. Those longitude/latitude-order ranges are plausible for Surabaya and agree with the frozen EPSG:4326/WGS84 contract. The absence of a legacy GeoJSON `crs` member is not a failure: the GeoJSON structure, coordinate order/ranges, explicit Master Guide contract, and coordinate-field comparison together establish EPSG:4326. A contradictory declaration or implausible/reversed coordinate interpretation remains a hard stop.

The exact observed property set is `ALAMAT`, `DESA`, `ID_DESA`, `ID_KABKOT`, `ID_KEC`, `ID_PROV`, `KABKOT`, `KECAMATAN`, `LATITUDE`, `LONGITUDE`, `NAMA`, `PROVINSI`, `STATUS`, `TANGGAL PENGUMPULAN`, `TANGGAL UPDATE`, `TELEPON`, `TIPE_1`, `TIPE_2`, and `TIPE_3`. All 2,173 records have every required mapped property. `NAMA`, `TIPE_1`, `TIPE_2`, `TIPE_3`, `ALAMAT`, `KECAMATAN`, `DESA`, `LONGITUDE`, `LATITUDE`, `STATUS`, `TANGGAL PENGUMPULAN`, and `TANGGAL UPDATE` have zero null and zero whitespace-blank values. `TELEPON` has zero nulls and 373 whitespace-blank strings; it will map to canonical null. These are observed source facts, not a claim that all optional fields are complete.

All 2,173 Points have comparable finite `geometry.coordinates` and numeric `properties.LONGITUDE`/`LATITUDE`; none is missing or malformed. At a tolerance of `0.000001` degrees, all 2,173 pairs agree, with maximum absolute longitude delta `0.000000500000012948476` and latitude delta `0.000000500000000513978`. The properties are rounded to six decimals for some records, whereas geometry retains up to seven decimal places: only 1,639 pairs agree at the stricter `0.0000001` degree tolerance. This is a rounding/precision effect, not evidence of a coordinate-order reversal.

Accordingly, the **frozen identity-coordinate authority is `feature.geometry.coordinates` in `[longitude, latitude]` order**. It is the canonical GeoJSON geometry selected, transformed, clipped, and emitted, and preserves more source precision than the rounded properties. `LONGITUDE`/`LATITUDE` remain mandatory cross-check lineage/evidence fields during ingestion; a future delta exceeding `0.000001` degrees, non-finite value, missing value, or reversed order is a hard stop, not a fallback to the property coordinates.

The frozen source-to-canonical mapping is:

| Required source property | Canonical output field |
| --- | --- |
| `NAMA` | `merchant_name` |
| `TIPE_1` | `category_l1` |
| `TIPE_2` | `category_l2` |
| `TIPE_3` | `category_l3` |
| `TELEPON` | `phone` |
| `ALAMAT` | `address` |
| `KECAMATAN` | `district` |
| `DESA` | `village` |
| `STATUS` | `status` |
| `TANGGAL PENGUMPULAN` | `collected_at` |
| `TANGGAL UPDATE` | `updated_at` |
| feature `geometry` | GeoJSON geometry |

`merchant_name` is canonical NOT NULL. The observed source has zero null/blank `NAMA` values, but the implementation must reject/exclude any future raw feature whose `NAMA` is null, non-string/non-coercible, or blank after Unicode/whitespace normalization; it must count these exclusions and fail validation if any output `merchant_name` is null/blank. Optional blank strings such as `TELEPON` normalize to null. The workflow retains raw lineage through source path, source-file SHA-256, and zero-based source feature index; it must not invent price, rating, opening hours, menu data, or external enrichment.

`HALTE DI KOTA SURABAYA TAHUN 2025.geojson` remains explicitly non-canonical. It must not be copied, substituted, read as a fallback, or named in P0 output lineage. The road dataset is not a Phase-1 input.

## 6. Assumptions

### Frozen requirements

- The inspected source coordinates are consistently interpretable as EPSG:4326/WGS84 in longitude/latitude order, and all web-facing output geometries will be encoded in that order. No legacy `crs` member is required when the observed GeoJSON, ranges, frozen contract, and coordinate cross-check agree.
- All nine P0 transit records are observed valid Points. A future raw-file drift to a different geometry type requires escalation rather than coercion.
- All culinary features are observed Points. Non-Point, null, non-finite, out-of-range, or geometry/property-coordinate-inconsistent features are ineligible and counted; a material pattern is a hard stop.
- The study-area and routing buffers use frozen EPSG:32749 operations only, never degree-based buffers.

### Implementation proposals pending review

- Use the Phase-0 Python 3.13 `.venv-spatial` convention with a small standalone CLI and standard-library `unittest`, not a notebook or new application service.
- Pin `geopandas==1.1.4`, `shapely==2.1.2`, and `pyproj==3.8.0` in the future `scripts/spatial/requirements.txt`, matching Phase-0 compatibility evidence. GeoPandas provides GeoJSON/tabular handling; Shapely provides explicit geometry predicates/buffers; pyproj provides the fixed CRS transforms. No package is added now. If delivery-time compatibility differs, report it for review rather than silently changing the runtime.
- Preserve source date/time values as source strings in P0 output rather than parsing/reformatting them. The observed culinary date fields include source-formatted values such as quarter/year and `DD/MM/YYYY`; no stable conversion is assumed.
- Use source feature/activity ordinal positions only as lineage locators, never as identifiers or selection criteria.

## 7. Proposed Changes

During a later approved implementation, add a minimal offline processing unit under `scripts/spatial/` and tests under `tests/spatial/`. The CLI will accept explicit raw input paths and fixed output paths, validate before any final output replacement, and emit a concise diagnostic report. It will never write inside `data/raw/`.

Planned processing sequence:

1. Confirm the two canonical paths exist, are readable regular files, and calculate their SHA-256 values before processing.
2. Parse and validate the Survey Activities wrapper; record its top-level keys, resolved activity-collection key/path, raw activity count, and expected-field coverage. Abort on a material contract mismatch.
3. Build a `stop_id`-keyed index; reject duplicate raw `_id` values for a requested P0 ID; select only the nine exact frozen IDs in the listed order; fail if any is absent or more/fewer than nine are selected.
4. Validate each selected transit Point in EPSG:4326, transform it to EPSG:32749, construct both required metric polygons, then transform both display geometries back to EPSG:4326.
5. Parse and validate the observed culinary FeatureCollection shape, EPSG:4326 evidence, required properties, and the geometry-versus-`LONGITUDE`/`LATITUDE` guard. Map only frozen attributes, reject unnamed candidates, normalize optional empty strings to null, and derive each `merchant_id` from authoritative geometry coordinates before spatial selection.
6. Transform each eligible culinary point to EPSG:32749 and retain it precisely when `study_area_metric.covers(point_metric)` is true. `covers` includes a point on the boundary, so boundary POIs are retained. No distance, popularity, attribute-quality, or unsupported-field filter is applied.
7. Sort transit by the frozen ID order and culinary output by `(merchant_id, source_feature_index)`, write deterministic GeoJSON/CSV/documentation without run timestamps, validate all artifacts, and only then atomically replace the final derived paths when an explicit overwrite option is supplied.

Any temporary file must be created beside its intended derived target with a `.partial` suffix, validated, and removed on failure. The existing `.gitignore` already targets this suffix. Raw files are never temporary targets or replace targets.

## 8. Files to Create / Modify

The following is a proposal for the later implementation, not a list of changes made now.

| Proposed path | Action | Responsibility |
| --- | --- | --- |
| `scripts/spatial/requirements.txt` | Create | Pin the approved Phase-1 spatial dependencies for the frozen Python 3.13 environment. |
| `scripts/spatial/p0_ingestion.py` | Create | CLI plus testable parsing, canonicalization, metric study-area construction, clipping, deterministic serialization, diagnostics, and raw-hash verification. Proposed functions: `load_survey_activities`, `select_p0_stops`, `validate_point_geometry`, `build_p0_areas`, `normalize_merchant_identity`, `merchant_uuid`, `canonicalize_culinary`, `write_p0_outputs`, and `validate_p0_outputs`. |
| `tests/spatial/test_p0_ingestion.py` | Create | `unittest` fixtures and deterministic/unit/integration validation using synthetic inputs; tests must not alter production raw files or emit production output paths. |
| `docs/data/P0_DATA_DICTIONARY.md` | Create | Describe every P0 output, schema, field mapping, CRS, identity scheme, lineage fields, null policy, study-area method, review-CSV status model, and prohibited attributes. |
| `data/processed/p0/transit_points_p0.geojson` | Create as derived output | Exactly nine canonical transit point features. |
| `data/processed/p0/study_area_p0.geojson` | Create as derived output | One P0 study-area polygon feature. |
| `data/processed/p0/routing_processing_extent.geojson` | Create as derived output | One Phase-2-only routing extent polygon feature. |
| `data/processed/p0/culinary_poi_p0.geojson` | Create as derived output | Canonical, study-area-covered culinary point features. |
| `data/interim/access_quality_p0_review.csv` | Create as derived output | Nine-stop pending review seed; not an approved accessibility dataset. |

No existing application file, package manifest, environment template, raw file, migration, API route, or frontend component is proposed for change.

## 9. Data / DB Schema Impact

There is no Phase-1 database, migration, Supabase, or API schema impact. The artifacts below are a file-based canonical contract consumed by later phases only.

All four GeoJSON outputs will be FeatureCollections in EPSG:4326 (longitude, latitude coordinate order) with a deterministic `metadata` foreign member containing at least `analysis_version`, `output_name`, `output_crs`, `source_files`, and source SHA-256 values. It must not contain volatile fields such as generation time. Feature properties are planned as follows.

| Output | Planned feature properties |
| --- | --- |
| `transit_points_p0.geojson` | `analysis_version`, `stop_id`, `stop_name`, `description_raw`, `surveyed_at`, `surveyor`, `media`, canonical `source`, canonical `validation_status`, canonical `scope`, `source_file`, `source_sha256`, `source_activity_index` |
| `study_area_p0.geojson` | `analysis_version`, `area_id` (`study_area_p0`), `metric_crs` (`EPSG:32749`), `web_crs` (`EPSG:4326`), `construction` (`convex_hull_of_9_p0_stops_buffered_1000m`), `buffer_m` (`1000`), `stop_ids` (ordered frozen IDs), `transit_source_file`, `transit_source_sha256` |
| `routing_processing_extent.geojson` | `analysis_version`, `area_id` (`routing_processing_extent`), `metric_crs`, `web_crs`, `construction` (`study_area_p0_buffered_300m`), `additional_buffer_m` (`300`), `study_area_id`, `transit_source_file`, `transit_source_sha256` |
| `culinary_poi_p0.geojson` | `analysis_version`, `merchant_id`, `merchant_name`, `category_l1`, `category_l2`, `category_l3`, `phone`, `address`, `district`, `village`, `status`, `collected_at`, `updated_at`, canonical `source`, canonical `validation_status`, `source_file`, `source_sha256`, `source_feature_index` |

`source`, `validation_status`, and `scope` are canonical-model fields, not aliases for lineage fields: `source_file`, `source_sha256`, and source index are supplemental only. Phase-01 freezes these simple canonical literals and requires them to be non-null:

| Output model | `source` | `validation_status` | `scope` |
| --- | --- | --- | --- |
| P0 transit | `SurveiActivities.GeoJSON` | `valid` | `p0-central` |
| P0 culinary | `MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` | `valid` | Not a culinary canonical field; the file-level `analysis_version` remains `p0-central-v1`. |

Here, `validation_status = "valid"` means the canonical output record passed Phase-1 structural, exact-ID (for transit), geometry, CRS, and required-field validation. It does not mean human Access Quality approval, merchant-routing eligibility, or any later analytical endorsement. `P0_DATA_DICTIONARY.md` must record those literals and semantics. No filename/hash may substitute for canonical `source`. `media` may remain JSON/array data as supplied. Canonical optional string fields become null only when their source value is null or normalizes to empty; `merchant_name` is the exception and must never be null/blank in output. The P0 culinary output deliberately has no `price`, `rating`, `opening_hours`, `menu`, or derived access/ranking field.

The review CSV will have this fixed column order:

```text
analysis_version,stop_id,stop_name,source,validation_status,scope,source_file,source_sha256,source_activity_index,description_raw,surveyed_at,surveyor,suggested_shelter,suggested_seating,suggested_pedestrian_condition,suggested_cleanliness,suggested_traffic_condition,suggested_rationale,suggestion_confidence,review_status,approved_shelter,approved_seating,approved_pedestrian_condition,approved_cleanliness,approved_traffic_condition,reviewed_by,reviewed_at,review_notes
```

`description_raw`, source identifiers, dates, and surveyor are raw evidence. `suggested_*` columns are optional, explicitly non-factual interpretation targeted only at shelter, seating, pedestrian condition, cleanliness, and traffic condition; absent/unsupported suggestions are blank, not inferred. The `approved_*`, `reviewed_by`, `reviewed_at`, and `review_notes` columns represent the canonical human-review target and are initially blank. The initial `review_status` is exactly `pending`. The future processor must not turn suggestions into approved values or expose either to production UI. Survey descriptions characterize the stop/local-surrounding access condition only, never an entire stop-to-merchant pedestrian corridor.

The review CSV uses the transit canonical values for its `source`, `validation_status`, and `scope` columns because it contains stop-survey evidence. Its `review_status = pending` is intentionally distinct from output `validation_status = valid`.

## 10. Algorithms / Processing Details

### Deterministic transit selection and geometry validation

The future parser must operate over the actually verified Survey Activities collection, retain the delivered activity object in memory unchanged, and construct a separate canonical record. It will select from an exact set of the nine frozen hexadecimal IDs, then serialize in the frozen list order. It will reject an empty/duplicate `_id`, a missing requested ID, duplicate selected `stop_id`, null/malformed geometry, geometry other than Point, non-finite coordinates, or longitude/latitude outside `[-180, 180]` / `[-90, 90]`. It will log raw activity count, matched count, missing IDs, duplicates, geometry observations, and CRS evidence.

Implementation will encode the supplied Master Guide Section 3.2 table as a deterministic test/reference fixture or constant keyed by `stop_id`, containing the baseline display name, longitude, and latitude. It will compare the actual selected `activity.geometry.coordinates` to that fixture at `0.0000001` degrees and report per-axis deltas. This fixture is a test guard against bad wrapper parsing and coordinate-order reversal; it is never a geometry source. The emitted and projected transit geometry always remains the raw Survey Activities Point.

### CRS and P0 area construction

1. Read the nine validated Point coordinates as EPSG:4326 and create an explicit `pyproj.Transformer` with `always_xy=True` to EPSG:32749.
2. Transform points in frozen stop-ID order; create a Shapely `MultiPoint`; calculate its convex hull.
3. Call `convex_hull.buffer(1000, quad_segs=16)` in metres to create the metric study area. `quad_segs=16` is explicit to avoid a library-default drift.
4. From the in-memory metric study polygon—not from a rounded/re-serialized web geometry—call `.buffer(300, quad_segs=16)` to form the routing-processing extent.
5. Validate both as non-empty valid Polygon/MultiPolygon geometry, preserve fixed dependency versions, and inverse-transform with an `always_xy=True` EPSG:32749-to-EPSG:4326 transformer for GeoJSON output.

The implementation will use deterministic JSON serialization (UTF-8, stable feature ordering, stable property insertion/order, and no clock-derived metadata) so identical raw bytes and dependency versions reproduce identical logical outputs. It will compare normalized geometry representations or stable output bytes in test fixtures, while allowing no hidden CRS/default-buffer behavior.

### Deterministic `merchant_id`

The inspected coordinate comparison resolves the identity-coordinate decision: `feature.geometry.coordinates` is authoritative in `[longitude, latitude]` order. It agrees with `properties.LONGITUDE`/`LATITUDE` for all 2,173 features at `0.000001` degrees; the maximum observed delta is about `0.0000005` degrees and reflects six-decimal property rounding. Geometry retains the higher delivered precision, is the GeoJSON representation actually clipped/emitted, and must therefore be the sole source for `normalized_longitude` and `normalized_latitude`.

The future ingestion run must repeat this guard over every source record and report comparable, matching, missing, malformed, and mismatching counts plus representative indexes. It must parse all four values as finite decimals and require absolute longitude and latitude deltas of at most `0.000001` degrees. A missing/malformed value, a larger delta, non-finite coordinate, or coordinate-order reversal is a hard stop requiring review; it must not silently switch the identity source to the properties.

The UUIDv5 namespace is frozen now as the long-lived RUJAK analytical identity contract:

```text
RUJAK_MERCHANT_NAMESPACE = c7e6bb16-9db1-560a-aa6b-781ebf8990be
merchant_id = UUIDv5(RUJAK_MERCHANT_NAMESPACE, normalized_name + "|" + normalized_longitude + "|" + normalized_latitude)
```

This UUID is the UUIDv5 result of the prior derivation `UUIDv5(NAMESPACE_URL, "https://github.com/akmalbobsaid/MAPID-WebGIS-Competition/rujak/merchant-id/v1")`; it is now the literal source of truth. It must be recorded verbatim in `P0_DATA_DICTIONARY.md` and asserted in tests. Changing it would regenerate every merchant ID and is prohibited after Phase-1 without an approved analytical-identity migration. `normalized_name` is source `NAMA` Unicode-normalized with NFKC, Unicode-casefolded, split on all Unicode whitespace, rejoined with one ASCII space, and stripped.

Geometry longitude and latitude are converted via `Decimal(str(value))`, canonicalized so negative zero is zero, quantized to exactly seven decimal places using `ROUND_HALF_EVEN`, and serialized as fixed seven-decimal ASCII strings. Longitude precedes latitude. Null, malformed, non-finite, out-of-range, or non-Point coordinates cannot generate an ID and are excluded from eligible P0 output with a diagnostic count. `merchant_name` is a canonical NOT NULL field: null `NAMA`, a non-string/non-coercible value, or a name blank after the documented normalization prevents `merchant_id` generation and excludes that source feature from `culinary_poi_p0.geojson`. The diagnostic report must state null, blank, excluded, and retained counts; output validation fails if any canonical `merchant_name` is null or blank. A duplicate generated `merchant_id` is a validation failure, not a reason to add a source ordinal or alter the identity string. Tests will cover Unicode-equivalent names, casing/whitespace equivalence, negative zero, repeat execution, known UUID fixture value, unnamed-merchant exclusion, malformed coordinate rejection, geometry/property-coordinate consistency, and collision detection.

### Culinary validation, mapping, and clip

The parser must assert the observed FeatureCollection shape before iteration. It will report top-level keys, declared/observed CRS evidence, raw feature count, geometry-type distribution, invalid-geometry count, required-property coverage, null/blank counts for every mapped field (including distinct `NAMA` null and blank-after-trimming counts), geometry/property coordinate-comparison results, coordinate ranges, and duplicate normalized name/coordinate combinations. It must not rewrite the raw GeoJSON.

For each valid Point with a nonblank canonical merchant name, map the frozen source attributes, convert blank optional canonical strings to null, enforce the geometry/property coordinate guard, create the UUIDv5 identifier from authoritative geometry coordinates, transform its geometry to EPSG:32749, and evaluate `study_area_metric.covers(point_metric)`. `covers` is the exclusive spatial predicate: a point strictly inside or exactly on the study-area boundary is retained; any point outside is omitted. The resulting P0 count is diagnostic only. The earlier approximately-355 screen is not an assertion and must never be used to tune the area or filtering.

### Reproducibility and lineage

Before output write, hash each canonical raw input using SHA-256; re-hash after processing and fail if it changed. Store the unmodified source path, hash, and original ordinal on each canonical feature and the hash/path in collection metadata. Validate output source-file values against an allowlist containing only the two canonical Phase-1 paths. The stale halte path must be absent from every output property, metadata block, review CSV, and diagnostic lineage record.

## 11. API Contract Impact

There is no Phase-1 API implementation or endpoint change. The canonical GeoJSON and review CSV establish an offline file contract for later APIs: P0 transit identity is `stop_id`, culinary identity is `merchant_id`, output geometries are EPSG:4326, and `analysis_version` is `p0-central-v1`. Later code must not infer that the review suggestions are approved access-quality facts.

## 12. UI Impact

There is no Phase-1 UI, map, Leaflet, MAPID MAPS, or frontend implementation impact. Later UI work may display the canonical P0 datasets only after its own approved phase; it must not expose the pending/suggested access-quality fields as verified public information.

## 13. Tests and Validation

The later test suite will use small synthetic wrapper/FeatureCollection fixtures plus an approved run against supplied raw files. It will test the following checks and make failures explicit.

| Area | Required validation |
| --- | --- |
| Transit | Exactly 9 P0 records; every frozen ID found exactly once; unique `stop_id`; selection driven solely by exact IDs; Point, valid, finite, EPSG:4326-interpretable geometry; correct wrapper/field mapping; primary demo stop retained; required canonical fields with values `source = SurveiActivities.GeoJSON`, `validation_status = valid`, and `scope = p0-central`; and every raw P0 coordinate compared with the committed Master Guide Section 3.2 reference fixture at `0.0000001` degrees, reporting explicit deltas and guarding longitude/latitude order. |
| Study area | Built from exactly those nine points; transformer is EPSG:4326 to EPSG:32749 with `always_xy`; 1,000-metre buffer and explicit `quad_segs=16`; 300-metre extent buffer in metric CRS; final output EPSG:4326; every P0 stop is covered by the study area; `routing_processing_extent` covers the complete `study_area_p0`; repeated runs yield the same normalized geometry/output. |
| Culinary | Input is the observed FeatureCollection; required properties and observed null/blank behavior reported; all Points valid; every geometry `[lon,lat]` compared with `LONGITUDE`/`LATITUDE` at `0.000001` degrees; geometry is used for identity; transformed predicate is exactly `study_area_metric.covers(point_metric)`; retained features are covered by study area; no null/blank canonical merchant name; required canonical fields with values `source = MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` and `validation_status = valid`; no fabricated fields; unique deterministic UUIDv5 IDs across repeat runs; invalid/malformed coordinate handling and duplicate-ID failure. |
| Lineage / safety | Input SHA-256 values are unchanged before/after; no write target can resolve within `data/raw`; every output cites only a canonical allowed source; the stale halte dataset is absent from lineage; output ordering/serialization is deterministic. |
| Review CSV | Exactly nine frozen stops in order; raw evidence columns preserved; review status starts `pending`; approved fields blank; suggestions remain separated and nullable. |

The command will report, at minimum: raw activity count, P0 matches/missing/duplicate IDs, actual-versus-Master-Guide stop-coordinate deltas, transit geometry/CRS observations, raw culinary count, geometry-type distribution, invalid culinary geometry count, geometry-versus-property coordinate-comparison counts/max deltas, `NAMA` null/blank/excluded/retained counts, mapped-field null/blank counts, duplicate normalized name/coordinate combinations, P0 culinary count, source hashes, output paths, and every validation result. A count materially unlike prior diagnostic screening is investigated through these diagnostics; it is not altered to reach a target.

## 14. Commands Codex Plans to Run

These commands are implementation-time proposals only. None was run in this planning-only pass, and none authorizes a dependency installation or output generation now.

```powershell
# Verify that Python 3.13 is the selected interpreter, then create the frozen local environment.
python --version
python -m venv .venv-spatial
.\.venv-spatial\Scripts\python.exe -m pip install -r scripts\spatial\requirements.txt

# Capture raw-input evidence before the approved run.
Get-FileHash -Algorithm SHA256 'data\raw\transit\SurveiActivities.GeoJSON'
Get-FileHash -Algorithm SHA256 'data\raw\culinary\MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson'

# Generate and validate only Phase-1 derived artifacts after the implementation is approved.
.\.venv-spatial\Scripts\python.exe scripts\spatial\p0_ingestion.py --transit 'data\raw\transit\SurveiActivities.GeoJSON' --culinary 'data\raw\culinary\MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson' --analysis-version p0-central-v1 --output-root data --data-dictionary docs\data\P0_DATA_DICTIONARY.md --overwrite

# Execute deterministic/unit validation, then re-check raw hashes.
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests\spatial -p 'test_*.py'
Get-FileHash -Algorithm SHA256 'data\raw\transit\SurveiActivities.GeoJSON'
Get-FileHash -Algorithm SHA256 'data\raw\culinary\MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson'
```

The future CLI must fail before final output replacement unless inputs, schema, geometry, CRS, all nine IDs, IDs/lineage, and output validation succeed. `--overwrite` affects only named derived output paths and must reject any path resolving under `data/raw`.

## 15. Risks / Failure Modes

- **Baseline-fixture drift:** the committed Section 3.2 reference fixture must preserve the supplied nine IDs/names/coordinates and `0.0000001`-degree comparison tolerance. A future guide revision or raw-coordinate mismatch requires review; do not replace actual raw geometry with fixture values.
- **Transit-wrapper mismatch:** unexpected top-level schema, activity collection, key names, or geometry representation is a hard stop. Do not coerce it into an assumed FeatureCollection parser.
- **Frozen stops missing/ambiguous:** any missing frozen ID, duplicate selected ID, or invalid selected geometry stops processing. Do not substitute a title match, a nearby point, or the stale halte layer.
- **CRS uncertainty:** lack of a legacy GeoJSON `crs` member alone is not failure for these inspected files. A contradictory declaration, implausible coordinates, geometry/property mismatch over `0.000001` degrees, or inability to confidently interpret EPSG:4326 stops processing; no degree-based fallback is allowed.
- **Study-area non-reproducibility:** inability to run the fixed EPSG:32749 convex-hull/1,000-metre/300-metre sequence, invalid area geometry, or a proposed changed extent requires review rather than substitution.
- **Culinary quality/coverage:** the current source has 2,173 valid named Points and 373 blank phones, but future drift/malformed records are diagnosed. If required `NAMA` becomes null/blank, geometry/property coordinates disagree, geometry type changes, or P0 coverage is materially inconsistent (including an extremely different count without an explainable source/CRS cause), stop and report; never tune the method to match about 355.
- **Identifier collision:** a generated duplicate UUIDv5 signals insufficient identity information for the prescribed string and must be escalated; do not append source index or generate a random UUID.
- **Lineage/fabrication breach:** any use of the stale halte data, automatic CSV concatenation, external scrape, fabricated culinary field, or raw-file write is a validation failure.
- **Material architecture change:** needing a database, notebook-only workflow, new backend/frontend capability, or unapproved dependency/runtime strategy is out of scope and requires review.

## 16. Rollback / Recovery

This planning pass changes only this plan document. If rejected, reverting that document restores the prior repository state.

For later implementation, the raw inputs are never rollback targets. The CLI will write validated derived artifacts atomically via `.partial` siblings and only replace the five named derived files and data dictionary after a complete successful run. A failed run removes its partial artifacts and leaves prior valid derived files intact. Recovery from a defective derived run consists of preserving the diagnostic report and raw hashes, fixing the reviewed implementation issue, then regenerating all P0 derived files from the unchanged raw source; no manual geometry/data edit is permitted. If outputs have been versioned, use a reviewed version-control revert for derived/documentation files only.

## 17. Open Questions

There are no blocking Phase-01 planning questions. The canonical source files, Section 3.2 coordinate baseline, canonical field literals, identity contract, and source/CRS evidence are resolved. Git status/history remains unavailable while `git` is absent from `PATH`; this is a non-blocking repository-provenance limitation only.

## 18. Definition of Done

The later Phase-1 implementation is done only when the two supplied canonical raw files have been inspected and remain byte-identical; their actual schemas and CRS observations are documented; all nine raw stop coordinates have passed the `0.0000001`-degree comparison against the committed Master Guide Section 3.2 reference fixture while emitted geometry remains raw Survey Activities geometry; exactly nine exact-ID P0 stops and the frozen primary demo stop are present; transit canonical fields are `source = SurveiActivities.GeoJSON`, `validation_status = valid`, and `scope = p0-central`; culinary canonical fields are `source = MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` and `validation_status = valid`; the 1,000-metre EPSG:32749 study area and 300-metre routing extent validate and are emitted in EPSG:4326; the routing extent covers the full study area; canonical culinary features are valid, named, geometry/property-coordinate-consistent, deterministically identified from geometry, and retained only by the documented `covers` predicate; the five derived data artifacts plus data dictionary exist; the pending review CSV separates raw evidence, suggestions, and approvals; tests and diagnostics pass; and no stale halte data, raw mutation, fabricated attributes, database/API/UI/routing work, or P1 work occurred.

For this planning pass specifically, completion means this plan is ready for implementation review, with actual repository/data findings and the supplied Guide baseline recorded, without claiming ingestion or spatial processing has occurred.
