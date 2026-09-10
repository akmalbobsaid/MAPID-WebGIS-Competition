# P0 Data Dictionary

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
