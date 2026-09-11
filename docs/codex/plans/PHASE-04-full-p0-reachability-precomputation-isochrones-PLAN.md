# PHASE-04 Plan

## 1. Goal

Produce the offline, deterministic P0 analytical source of truth for all nine
canonical Central Surabaya stops: canonical snap outputs, one stop--merchant
access row for every stop/merchant pair, and 5/10-minute network-derived
isochrones. The work will preserve the approved graph, CRS, thresholds,
connector-inclusive distance formula, canonical IDs, and `p0-central-v1`.

This document is planning only. It does not authorize implementation until the
Phase-03 GO NEXT review is explicitly granted.

## 2. In Scope

- Regenerate canonical Phase-04 stop and merchant snap artifacts from the exact
  approved Phase-03 nearest-node algorithm and frozen thresholds.
- Run one deterministic single-source Dijkstra per routable stop on the
  approved undirected `networkx.MultiGraph`, then materialize all P0
  stop--merchant relationships.
- Produce 5- and 10-minute network service-area polygons per routable stop.
- Write the required analytical output documentation, validation, regression,
  reproducibility, and per-stop diagnostic metrics.
- Reuse the existing Phase-02 graph loader/build contract and Phase-03 snapping,
  Dijkstra, parallel-edge reconstruction, atomic writing, hashing, and
  validation conventions rather than changing the analytical model.

## 3. Explicitly Out of Scope

- Any raw-input change, road-source replacement, graph rebuild, graph topology
  redesign, geometric crossing noding, highway-filter change, walking-speed
  change, study-area change, threshold change, or analysis-version bump.
- PostgreSQL/PostGIS migration or ingestion, backend/API work (PHASE-05), UI,
  WebGIS, MAPID integration (PHASE-06), AGUS/LLM and Access Quality
  finalization (PHASE-07), deployment (PHASE-08), or dynamic routing.
- Frontend routing/Dijkstra, external routing engines, Euclidean-radius
  eligibility, current-location/multimodal routing, 15-minute catchments, KDE,
  scoring/ranking, enrichment, or restaurant recommendations.

## 4. Current Repository Findings

### Verified repository state

- The repository contains `scripts/spatial`, `tests/spatial`, `data`, `docs`,
  and `apps/web`. The spatial runtime requirements are GeoPandas 1.1.4,
  Shapely 2.1.2, pyproj 3.8.0, and NetworkX 3.6.1; the existing test runner is
  `unittest` using `.venv-spatial\Scripts\python.exe`.
- Git metadata exists, but the `git` executable is unavailable on `PATH`.
  Therefore no `git status` or diff can be truthfully reported; the working
  tree must not be assumed clean. The implementation report must use an
  explicit changed-file summary if Git remains unavailable.
- The canonical Phase-01 inputs exist as EPSG:4326 GeoJSON:
  `data/processed/p0/transit_points_p0.geojson` (9 stops),
  `culinary_poi_p0.geojson` (355 merchants), `study_area_p0.geojson`, and
  `routing_processing_extent.geojson`. Their metadata uses
  `analysis_version: p0-central-v1`.
- The canonical Phase-02 graph exists as `pedestrian_nodes.geojson` (13,616
  nodes) and `pedestrian_edges.geojson` (14,818 edges). Its metadata says
  `undirected_multigraph`, metric CRS `EPSG:32749`, web-output CRS
  `EPSG:4326`, shared-source-coordinate-only topology, and walking speed 1.3
  m/s. The Phase-02 report records 73 components and a 95.0867% largest
  component.
- `scripts/spatial/p0_routing_validation.py` already provides strict GeoJSON
  loaders, `Node`/`Edge`/`Target`/`Snap` records, `load_nodes`, `load_graph`,
  deterministic metric `snap_target`, `networkx.single_source_dijkstra`,
  `route_geometry`, hashing, and atomic writers. `p0_walking_graph.py` remains
  the graph-construction source and must not be altered for this phase.
- Phase-03 generated interim evidence only:
  `phase03_stop_snaps_baseline.geojson`,
  `phase03_merchant_snaps_baseline.geojson`,
  `phase03_snapping_summary.json`, the Simpang Dukuh vertical slice, selected
  cases, and visual HTML/PNG. None of the required Phase-04 processed outputs
  or `ROUTING_OUTPUT_SUMMARY.md` exists yet.

### Approved upstream evidence

- `P0_TECHNICAL_FREEZE.md`, the Phase-01/02 reports, the Phase-03 report, and
  `docs/methodology/ROUTING_VALIDATION_P0.md` agree on raw/display EPSG:4326,
  metric EPSG:32749, 1.3 m/s, the 300/600-second thresholds, the offline
  undirected graph plus Dijkstra architecture, and `p0-central-v1`.
- The Phase-03 report is **PASS / READY FOR GO NEXT REVIEW**. It records all
  9/9 stops as `routable` in `cc_000001`; primary stop
  `6a92c77152d86e03b51db962` (Halte Simpang Dukuh) snapped 3.649497 m and its
  visual vertical slice passed. It records 336/355 merchant snaps as
  `routable`, 19 as `snap_too_far`, no invalid merchant geometry, and 326
  primary-routable versus 10 primary-disconnected accepted merchant relations.
- The final documented Phase-03 thresholds are **30 m for stops** and **50 m
  for merchants**, with no proposed version bump. These—not preliminary values
  independently rediscovered during Phase-04—are the values to enforce.
- There is a provenance mismatch to resolve before implementation: the
  machine-generated `phase03_snapping_summary.json` retains
  `phase03_readiness: pending-manual-spatial-review` and manual-review-pending
  text, while the later Phase-03 report and methodology record seven completed
  manual PASS cases and phase PASS. The report/methodology are the approved
  gate evidence, but Phase-04 must record their paths/hashes and not relabel
  the interim artifact as independently approved. Explicit GO NEXT approval is
  still a hard prerequisite at implementation start.
- No explicit ChatGPT PHASE-03 `GO NEXT` authorization is recorded in the
  inspected repository artifacts. Therefore PHASE-04 **implementation is
  BLOCKED**, despite the report's review-ready PASS, until that authorization
  is supplied. This planning revision does not change Phase-03 evidence.

## 5. Source Files / Data Inputs

| Input / evidence | Phase-04 use |
| --- | --- |
| `data/processed/p0/transit_points_p0.geojson` | Immutable 9-stop canonical identity/geometry source. |
| `data/processed/p0/culinary_poi_p0.geojson` | Immutable 355-merchant canonical identity/geometry source; it is already restricted to `study_area_p0`. |
| `data/processed/p0/study_area_p0.geojson` | Scope reference only; do not re-filter merchants. |
| `data/processed/p0/routing_processing_extent.geojson` | Graph-lineage/preflight reference only; do not rebuild the graph. |
| `data/processed/p0/pedestrian_nodes.geojson`, `pedestrian_edges.geojson` | Exact approved graph, node coordinates/components, edge lengths, and Dijkstra input. |
| `data/interim/p0/phase03_stop_snaps_baseline.geojson`, `phase03_merchant_snaps_baseline.geojson` | Numerical regression/reference snaps; not promoted merely by copying because they are explicitly interim. |
| `data/interim/p0/phase03_halte_simpang_dukuh_vertical_slice.json` and selected-case GeoJSON | Primary-stop distance/status regression sample and path-reconstruction reference. |
| `docs/methodology/ROUTING_VALIDATION_P0.md` and Phase-03 report | Frozen threshold/gate/provenance evidence. |

The preflight will hash all four canonical routing inputs (transit, culinary,
nodes, edges), require their current metadata/version contracts, and store the
hashes as generated-output lineage. It will not mutate raw or upstream
processed inputs.

## 6. Assumptions

- Before implementation, reviewers issue the Phase-03 GO NEXT authorization;
  the existing PASS report alone is evidence for review readiness, not a
  replacement for that authorization.
- `p0-central-v1` remains the analysis version because no approved graph,
  speed, study-area, threshold, source, or topology decision changed. Any
  change to those assumptions—or a later material change to the isochrone
  construction contract—requires a deviation review and version decision,
  never a silent bump.
- The Phase-03 interim snaps will be **reproduced**, not copied: use its exact
  EPSG:32749 nearest-node rule, `(distance_m, node_id)` tie break, and 30/50-m
  thresholds. This is required because the Phase-03 artifacts are labelled
  interim, and its report explicitly assigns canonical processed snap creation
  to Phase-04. Reproduced results must numerically match the baseline records
  and input lineage before they become canonical.
- `walking_time_min` is a display/derived field; classifications always use
  unrounded `walking_time_seconds`. `max_stop_snap_distance_m = 30` is frozen
  **only** for stop snapping; it is not an isochrone-width rule.
- The proposed independent visual/cartographic parameter is
  `isochrone_buffer_m = 10.0`. It buffers source-reachable linework by a small,
  fixed corridor width solely to turn a network line service area into a
  legible polygon; it is neither a walking allowance nor an eligibility rule.
  The physical stop-to-snapped-node connector, with its actual travel cost,
  enters the source linework explicitly, so the width is not used to force the
  origin into a polygon. The 10-m width is deliberately conservative for a
  street-scale visual envelope; preflight geometry checks detect every overlap
  between buffers of nonincident network segments, and manual review must
  reject misleading apparent bridges. The value, buffer/cap/join settings, and
  related polygonization choices are method configuration, included in the
  fingerprint, and any later change requires the analysis-version/deviation
  process.

## 7. Proposed Changes

1. Add a narrow Phase-04 orchestration script,
   `scripts/spatial/p0_reachability_precompute.py`, which imports/reuses the
   Phase-03 graph/snap/path helpers instead of creating another graph or
   shortest-path implementation. If a Phase-03 helper needs a small public
   interface change, modify only that helper while preserving its interim-only
   Phase-03 `run_pipeline` contract and processed-root rejection.
2. Add `run_precompute(...)` and small pure helpers for pair-status resolution,
   access-row serialization, isochrone linework/polygon construction,
   per-stop metrics, preflight/lineage, and deterministic output serialization.
3. Add focused Phase-04 tests in
   `tests/spatial/test_p0_reachability_precompute.py`. Retain the existing
   Phase-01--03 tests unchanged except for a narrowly necessary shared-helper
   regression test.
4. Create the canonical outputs and
   `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` only during the approved future
   implementation pass. They are not generated during this planning pass.

## 8. Files to Create / Modify

| Path | Planned action |
| --- | --- |
| `scripts/spatial/p0_reachability_precompute.py` | Create deterministic Phase-04 CLI/orchestration; reuse Phase-03 loading, snapping, graph, Dijkstra, reconstruction, hashing, and atomic-write behavior. |
| `scripts/spatial/p0_routing_validation.py` | Modify only if required to expose a tested generic helper without changing its Phase-03 outputs or guard; otherwise reuse as-is. |
| `tests/spatial/test_p0_reachability_precompute.py` | Create synthetic and canonical-contract tests described below. |
| `tests/spatial/test_p0_routing_validation.py` | Modify only if a shared helper needs regression coverage; preserve its interim-only guard test. |
| `data/processed/p0/stop_snaps_p0.geojson` | Create canonical Phase-04 stop snap output. |
| `data/processed/p0/merchant_snaps_p0.geojson` | Create canonical Phase-04 merchant snap output. |
| `data/processed/p0/stop_merchant_access.geojson` | Create canonical pair-level analytical facts. |
| `data/processed/p0/stop_isochrones.geojson` | Create 5/10-minute per-stop network service areas. |
| `data/processed/p0/paths.geojson` | Optional; create only if route geometry for `<=10 min` rows is materially useful and the measured file size is acceptable. |
| `data/interim/p0/phase04_isochrone_validation.geojson` | Create a review overlay containing all 9 origins, 5/10-minute isochrones, source connectors, and walking-proxy network context. |
| `data/interim/p0/phase04_isochrone_validation.html` | Create a self-contained visual QA artifact with all 9 stops/layers and per-stop PASS/REVIEW/FAIL review fields. |
| `data/interim/p0/phase04_isochrone_visual_review.json` | Create the completed per-stop manual review record; automated generation may initialise it as `pending` but may not record PASS. |
| `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` | Create output contract, lineage, metric definitions, frozen decisions, method, diagnostics, and limitations. |

The only file created in the present planning pass is this plan.

## 9. Data / DB Schema Impact

Analytical file schema only; no database migration, SQL, PostGIS object, or
ingestion is in PHASE-04. GeoJSON remains the compatible repository convention
and is straightforward for later PostGIS ingestion.

All canonical outputs carry deterministic feature ordering, `analysis_version`,
`output_crs: EPSG:4326`, metric CRS where relevant, output name, frozen
threshold/speed metadata, input SHA-256 lineage, a stable machine-readable
method identifier, complete method parameters, and an analytical-method/config
fingerprint. Writes use the existing atomic-output pattern and require an
explicit `--overwrite` for an existing target. Without it, existing outputs
fail safely. With it, every existing Phase-04 target must have matching
upstream lineage, `analysis_version`, and method/config fingerprint; otherwise
the script refuses overwrite and requires deviation/version review. Thus the
same `p0-central-v1` cannot silently produce different isochrone geometry.

`stop_snaps_p0.geojson` and `merchant_snaps_p0.geojson` retain the Phase-03
snap fields (`*_id`, display name, `node_id`, `snap_distance_m`, `component_id`,
`routing_status`, `threshold_m`, `analysis_version`, input lineage) and their
EPSG:4326 source-point geometry. The canonical `routing_status` supports all
four values: `routable`, `snap_too_far`, `disconnected`, and
`invalid_geometry`. A separate `snap_acceptance_status`
(`accepted`/`snap_too_far`/`invalid_geometry`) preserves the purely geometric
nearest-node outcome, so topology relevance never overloads the snap result.

`stop_merchant_access.geojson` has one feature per full Cartesian input pair,
ordered by `(stop_id, merchant_id, analysis_version)`, with nullable top-level
GeoJSON geometry as the logical `path_geometry`. Its properties implement the
canonical logical contract:

- `stop_id`, `merchant_id`, `network_distance_m`, `total_distance_m`,
  `walking_time_seconds`, `walking_time_min`, `reachable_5min`,
  `reachable_10min`, `routing_status`, and `analysis_version`.
- Audit fields needed to make the formula/reason reviewable:
  `stop_snap_distance_m`, `merchant_snap_distance_m`, `stop_routing_status`,
  `merchant_routing_status`, `stop_node_id`, `merchant_node_id`,
  `stop_component_id`, `merchant_component_id`, and (when materialized)
  deterministic `path_node_ids`/edge lineage.

The primary identity is `(stop_id, merchant_id, analysis_version)`. A path is
not duplicated in a GeoJSON property: the feature's nullable top-level geometry
is the `path_geometry` field semantically. Geometry is stored only for
routable `<=10 min` pairs if the optional paths output is approved; otherwise it
is null and never affects flags. `paths.geojson`, when enabled, has the same
identity plus LineString geometry and connector/path audit fields; it is a
derivative, not the authoritative eligibility source.

`stop_isochrones.geojson` has one Polygon/MultiPolygon feature per routable
stop/duration, ordered by `(stop_id, duration_min, analysis_version)`. Its
minimum canonical schema is exactly `stop_id`, `duration_min`, `geometry`,
`method`, and `analysis_version`, where `duration_min` is only 5 or 10 and
`method` is the stable machine-readable identifier
`network_dijkstra_edge_intervals_buffer_v1`. Additional audit fields are
`duration_seconds`, snapped-node ID, connector length, `isochrone_buffer_m`,
buffer/cap/join parameters, input lineage, and method/config fingerprint.
Unroutable stops have no geometry feature and are reported in the
summary/diagnostics with a reason rather than an invented empty service area.

## 10. Algorithms / Processing Details

### Preflight, snapping, and full access matrix

1. Strictly load and validate the exact Phase-01/02 FeatureCollections and
   their `p0-central-v1` metadata; verify exactly nine unique stop IDs, unique
   merchant IDs, finite positive graph-edge lengths, matching node components,
   and the frozen undirected MultiGraph/1.3-m/s contract. Hash inputs before
   and after the run.
2. Re-run `snap_target` in EPSG:32749 once per canonical stop and merchant with
   the final 30/50-m thresholds, preserving the nearest diagnostic even where a
   valid geometry is too far. Sort source entities by canonical ID and retain
   the deterministic `(distance_m, node_id)` nearest-node tie break.
3. For each `routable` stop, run **one full**
   `networkx.single_source_dijkstra(graph, stop_node_id, weight="length_m")`.
   Do not apply a 10-minute cutoff: Phase-04 must materialize actual finite
   distance/time for every graph-reachable merchant, including those beyond 10
   minutes. This is at most nine runs over the already loaded 13,616-node,
   14,818-edge graph, avoids the naive 9 x 355 shortest-path approach, and
   preserves all disconnected results.
4. For an accepted merchant found in that source Dijkstra result, compute
   `network_distance_m` from the Dijkstra distance and then exactly:

   ```text
   total_distance_m = stop_snap_distance_m
                    + network_distance_m
                    + merchant_snap_distance_m
   walking_time_seconds = total_distance_m / 1.3
   walking_time_min = walking_time_seconds / 60
   ```

   Set `reachable_5min` from unrounded seconds `<= 300`, and
   `reachable_10min` from unrounded seconds `<= 600`. Sort downstream
   discovery only by `walking_time ASC`; generate no restaurant score.

### Routing-status contract

The canonical stop/merchant `routing_status` supports `routable`,
`snap_too_far`, `disconnected`, and `invalid_geometry`; it is not restricted to
the Phase-03 generic-snap vocabulary. First preserve the metric nearest-node
result in `snap_acceptance_status`. Then derive the canonical source status
against P0 topology: a valid accepted stop is `disconnected` when its component
contains no other accepted P0 routing endpoint for usable P0 analysis; a valid
accepted merchant is `disconnected` when its component contains no accepted P0
stop. Otherwise accepted sources are `routable`. The current Phase-03 evidence
places all accepted stops in `cc_000001`, so its ten accepted merchants in
other components become canonical merchant `disconnected` records in Phase-04
while retaining `snap_acceptance_status = accepted`. This is a topology fact,
not a changed nearest-node rule.

Each pair uses this deterministic precedence, while retaining both source
statuses and snap-acceptance statuses for diagnosis:

1. If either source is `invalid_geometry`, pair `routing_status` is
   `invalid_geometry`.
2. Else if either source is `snap_too_far`, it is `snap_too_far`.
3. Else if accepted nodes are in different components or the merchant node is
   absent from the source Dijkstra result, it is `disconnected`.
4. Otherwise it is `routable`.

For non-`routable` pairs, all network/total/time fields and path geometry are
null, and both reachability flags are **null**, not false. This distinguishes an
unsupported/uncomputed analytical result from a finite route known to exceed a
threshold. For routable rows only, both flags are booleans; a finite route over
10 minutes is therefore `false`/`false`.

### Network-derived isochrones

Isochrones are visual service areas only; merchant eligibility remains solely
the pair's shortest-path-derived unrounded walking time.

For each routable stop and each duration (300 and 600 seconds):

1. Reuse that stop's full Dijkstra distances. Derive the graph travel budget
   `B = duration_seconds * 1.3 - stop_snap_distance_m`; if `B < 0`, the stop
   has no service-area graph linework for that duration and is flagged rather
   than approximated. Add the physical metric stop-to-snapped-node connector
   to the source linework only when the duration can pay its full connector
   cost. The connector is therefore explicit visual/source geometry, not a
   buffer-based origin inclusion trick.
2. For every **undirected** metric edge `(u, v)` of length `L`, use each finite
   endpoint Dijkstra distance independently. Build the union of (a) the prefix
   from `u` of length `clamp(B - d(u), 0, L)` and (b) the prefix from `v` of
   length `clamp(B - d(v), 0, L)`, measured in reverse edge direction. Include
   the full edge if either interval has length `L` or the two prefixes overlap/
   touch; otherwise preserve both disjoint partial LineString segments. This
   uses metric-length substringing with the stored Phase-02 edge orientation
   and keeps both reachable approaches rather than incorrectly choosing one
   endpoint. The same formula with the smaller 5-minute budget guarantees the
   5-minute selected linework is a logical subset of the 10-minute linework.
   No circle, radial catchment, or unrelated component is introduced.
3. Project selected linework to EPSG:32749, preserve the connector, and create
   a visual service-area envelope by applying the independent
   `isochrone_buffer_m = 10.0` with fixed documented cap/join settings. It is
   cartographic polygonization only: the connector has already consumed its
   real travel budget and neither buffer width nor polygon membership changes
   merchant eligibility. Preserve holes. Before accepting the dissolve, use a
   spatial-index check to flag every overlap/touch created by buffers of
   nonincident, nonintersecting graph segments (an apparent shortcut/bridge).
   Such a bridge requires manual REVIEW/FAIL resolution; it cannot be silently
   accepted as network connectivity. Make geometry valid with the deterministic
   Shapely validity routine, extract polygonal members only, and reject an
   empty/non-polygonal result instead of substituting a circle.
4. Every retained Polygon/MultiPolygon component must intersect buffered
   source-connected selected linework and the final dissolved geometry must
   cover/touch the original stop Point through the explicit connector. A
   component failing that traceability test is a hard diagnostic, not silently
   retained. Since each selected edge is connected by a finite source path, a
   remote disconnected island is a failure to investigate rather than a valid
   service area.
5. Build 5 and 10 using identical parameters. Validate in metric CRS that
   `area(iso_5.difference(iso_10))` is within a documented numerical tolerance
   (maximum of `1e-4 m²` and `1e-9 * area(iso_5)`). If the excess is only
   numerical, deterministically union the 5-minute polygon into the 10-minute
   polygon and revalidate; any material excess is a hard stop. Reproject only
   final valid geometry to EPSG:4326 for output.

### Metrics, diagnostics, and report

The summary will report each stop's total pair count, `routable_merchant_count`
(finite pair rows with `routing_status = routable`), counts with each true
reachability flag, `unroutable_merchant_count` (all non-routable pair rows),
and the required `median_reachable_10min_walking_time_min`: median unrounded
walking time for rows where `reachable_10min = true` (the maximum P0 discovery
window). It is null when that set is empty. The optional diagnostic
`median_all_routable_walking_time_min` may separately report all finite
routable rows, but is never substituted for the required metric.
`snap_too_far`, `invalid_geometry`, and `disconnected` are broken out
separately; they do not enter either time-median denominator or a reachability
band denominator.

Automatic flags are review signals, not bug declarations: any unroutable stop,
missing snap, zero 10-minute count, invalid/empty/non-nested isochrone,
untraceable island, Phase-03 regression, changed input/row lineage, or invalid
invariant flags immediately. For comparative disparity across the nine stops,
calculate Tukey 1.5-IQR fences for finite per-stop 10-minute counts and median
times when IQR is nonzero; values outside the fences receive an explicit
`outlier_review` flag with the distribution and formula recorded. This is a
transparent robust exploratory rule for a small dataset, not a claim of
statistical significance; when IQR is zero, no spurious statistical outlier is
claimed and reviewers receive the raw table/ranks instead.

## 11. API Contract Impact

None. PHASE-04 creates offline analytical files only. PHASE-05 will decide how
to expose these facts, and must not rerun routing per request.

## 12. UI Impact

None. Isochrone GeoJSON is an offline data product for future use; PHASE-04
does not modify the Next.js app, add map layers, or implement discovery UI.

## 13. Tests and Validation

Add focused synthetic tests and a canonical-artifact integration test, then run
the full existing spatial suite. The tests will assert:

- Exactly nine frozen stops enter analysis; stop/merchant IDs are unique;
  canonical IDs survive snapping and rows; pair identity is unique and row
  count is exactly `9 * canonical merchant count`.
- Source snaps reproduce the Phase-03 baseline under the same input hashes,
  including Simpang Dukuh node/distance and 30/50-m thresholds. The approved
  primary slice's sample pairs must match network distance, total distance,
  walking time, and relationship status within `1e-6 m` / `1e-6 s` (or a
  stricter documented floating-point tolerance).
- Dijkstra uses the loaded Phase-02 MultiGraph, `length_m`, source snapped
  nodes, target snapped nodes, no negative/nonfinite serialised distance, and
  no route for disconnected pairs. Parallel-edge reconstruction still sums to
  the Dijkstra distance.
- For each routable row: nonnegative time, total >= network, total equals the
  two connectors plus network within tolerance, and time equals total / 1.3.
  `reachable_5min => reachable_10min`; true 5/10 flags have seconds <=300/600;
  and finite <=300 routes cannot have a false 10-minute flag. Non-routable rows
  have null distance/time/path/flags rather than fabricated finite results.
- Explicit synthetic boundary rows at exactly 300 s, just above 300 s, exactly
  600 s, and just above 600 s prove classification uses unrounded seconds, not
  rounded minutes.
- Re-running into two temporary output roots with fixed inputs/version produces
  the same IDs, row count, flags, numeric values within deterministic tolerance,
  metadata lineage, and byte-stable JSON/GeoJSON serialization where the
  toolchain permits. Canonical overwrite behavior is separately tested as
  explicit, atomic, and guarded by matching version, upstream lineage, and
  analytical method/config fingerprint; a changed method/parameter at the same
  version must refuse overwrite.
- Synthetic undirected partial-edge tests cover: only the `u` endpoint
  reachable; only `v` reachable; both endpoints partially reachable with two
  non-overlapping segments retained; both prefixes overlapping/touching so the
  full edge is selected; and one endpoint able to reach the full edge. A paired
  5/10-minute fixture asserts the 5-minute edge intervals/linework are a
  logical subset of the 10-minute intervals/linework.
- Each isochrone has only duration 5/10, valid nonempty Polygon/MultiPolygon
  geometry in EPSG:4326, canonical `duration_min`, stable `method`, source stop
  covered/touched through its explicit connector, metric 5-in-10 nesting within
  the stated tolerance, and every polygon component traceable to the selected
  source-reachable linework. A deliberately disconnected synthetic island and
  a nonincident-buffer bridge must be detected/flagged.
- A test with a merchant point inside an isochrone but a shortest-path time
  above the threshold (and conversely a route/path geometry case near a
  polygon boundary) proves eligibility is taken from Dijkstra time, never
  `point-in-polygon` membership.
- The implementation produces the stated visual overlay/HTML and a review
  record for **all 9 P0 stops**, each explicitly marked PASS, REVIEW, or FAIL.
  The overlay shows both durations, origin, explicit connector, and walking
  proxy network. The primary demo stop is reviewed separately; every automatic
  outlier, zero/very-low or unusually large coverage, suspicious geometry, and
  buffer-bridge flag is a hard visual-review item. Automated validity/nesting
  tests cannot supply PASS; Phase-04 cannot be reported PASS while any review
  item remains REVIEW/FAIL.

## 14. Commands Codex Plans to Run

These are future implementation commands, based on the existing Python runtime
and unittest conventions; they are not run in this planning pass.

```powershell
# 1. Immutable-input and Phase-03 evidence preflight
$inputs = @(
  'data\processed\p0\transit_points_p0.geojson',
  'data\processed\p0\culinary_poi_p0.geojson',
  'data\processed\p0\pedestrian_nodes.geojson',
  'data\processed\p0\pedestrian_edges.geojson'
)
Get-FileHash -Algorithm SHA256 -LiteralPath $inputs
Get-Content -Raw 'docs\methodology\ROUTING_VALIDATION_P0.md'

# 2. Full precompute (only after GO NEXT)
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_reachability_precompute.py `
  --transit-points 'data\processed\p0\transit_points_p0.geojson' `
  --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' `
  --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' `
  --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' `
  --phase03-stop-snaps 'data\interim\p0\phase03_stop_snaps_baseline.geojson' `
  --phase03-merchant-snaps 'data\interim\p0\phase03_merchant_snaps_baseline.geojson' `
  --phase03-primary-slice 'data\interim\p0\phase03_halte_simpang_dukuh_vertical_slice.json' `
  --analysis-version 'p0-central-v1' --output-root data `
  --isochrone-method 'network_dijkstra_edge_intervals_buffer_v1' `
  --isochrone-buffer-m 10.0 `
  --methodology 'docs\methodology\ROUTING_OUTPUT_SUMMARY.md' --overwrite

# 3. Tests and dependency integrity
& '.\.venv-spatial\Scripts\python.exe' -m unittest tests.spatial.test_p0_reachability_precompute -v
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v
& '.\.venv-spatial\Scripts\python.exe' -m pip check

# 4. Reproducibility/lineage verification (the test performs two temporary-root runs)
Get-FileHash -Algorithm SHA256 -LiteralPath $inputs
Get-FileHash -Algorithm SHA256 -LiteralPath `
  'data\processed\p0\stop_snaps_p0.geojson', `
  'data\processed\p0\merchant_snaps_p0.geojson', `
  'data\processed\p0\stop_merchant_access.geojson', `
  'data\processed\p0\stop_isochrones.geojson'
```

No lint/type command is currently planned for the Python spatial scripts: the
repository exposes no Python linter/type-checker configuration. Existing web
lint is unrelated and will not be run as a substitute for spatial validation.

## 15. Risks / Failure Modes

| Risk / detection | Mitigation or hard-stop response |
| --- | --- |
| Phase-03 GO NEXT is absent, the primary fails, final thresholds/version cannot be established, or interim/manual provenance conflicts materially | Stop. Reconcile/document Phase-03 gate evidence; do not infer approval or resnap under guessed values. |
| Current graph/input hash or metadata differs from the graph validated in Phase-03 | Stop; do not mix snaps/routes from different graph lineage. |
| CRS/unit error, nonfinite values, connector omission, rounded classification, or Phase-03 regression | Fail preflight/invariants/regression; no approximation or silent tolerance widening. |
| Stop or accepted merchant is disconnected | Preserve `snap_acceptance_status`, materialize canonical `disconnected` status/null pair facts, flag for review, never repair topology or invent a path. |
| Nine full Dijkstra runs or 9 x 355 rows are costly | Load graph once, run one source search per routable stop, stream/sort rows deterministically; the graph/row scale is modest but record elapsed time and peak-memory observation. |
| Optional path geometry causes large output | Default to null/no `paths.geojson`; measure `<=10 min` count/bytes first and enable only with explicit size acceptance. |
| Stale/inconsistent Phase-03 snap evidence | Compare reproduced nodes/distances/statuses plus upstream hashes; use interim artifacts only as regression evidence, not as unverified canonical copies. |
| Polygonization creates invalid, non-nested, remote, or visually bridged geometry | Use explicit connector plus source-reachable edge intervals, deterministic validity/component/nesting tests, nonincident-buffer bridge detection, and all-stop manual QA; reject rather than circle-buffer fallback. |
| Non-deterministic ordering/serialization, method drift, or analysis-version mixing | Stable sort all inputs/features, include metadata lineage and a complete method/config fingerprint, use temporary-root reruns, and refuse same-version overwrite when the fingerprint differs. |
| Accidental overwrite of prior outputs | Explicit `--overwrite`, target allowlist, matching input lineage/version/fingerprint guard, and atomic replacement only of named Phase-04 outputs. |
| Canonical IDs lost or future ingest is awkward | Preserve IDs and pair key as fields, retain feature/order lineage, and keep files flat GeoJSON without DB business logic. |

Hard stops include every condition above plus absent explicit Phase-03 GO NEXT,
a required model change (filter, speed, threshold, topology, study area,
source, or isochrone method/config needing a version decision), a material
5-in-10 nesting failure, unexplained remote island or nonincident-buffer bridge,
an unresolved all-stop visual REVIEW/FAIL, input/row-count lineage change, or a
fundamental Phase-03 helper bug. None permits a Euclidean reachability
replacement.

## 16. Rollback / Recovery

Phase-04 writes only the named generated outputs and methodology document via
atomic replacement; raw inputs and Phase-01/02 graph outputs are never touched.
Before any approved overwrite, preserve/record output hashes, lineage, and the
method/config fingerprint. A failed run leaves prior complete files intact;
remove or replace only the exact Phase-04 target after confirming its resolved
path. A different fingerprint is not a recovery rerun at the same version: it
requires deviation/version review. Recovery is to restore the prior named
generated artifact (if any), retain diagnostic evidence, resolve the identified
dependency/deviation, and rerun deterministically. Do not use Git reset or
broad deletion, and do not attempt to roll back by changing raw data.

## 17. Open Questions

1. No explicit PHASE-03 GO NEXT authorization is present in the inspected
   repository evidence. PHASE-04 implementation is BLOCKED until the reviewer
   supplies it; `PASS / READY FOR GO NEXT REVIEW` is not GO NEXT.
2. Can the Phase-03 report/methodology's documented completed manual PASS be
   accepted as the authoritative record while the earlier generated interim
   JSON continues to say manual review pending? If yes, Phase-04 will cite both
   and preserve the mismatch in lineage; if not, Phase-03 needs a documentation
   correction before Phase-04 implementation.
3. Is optional `paths.geojson` desired after the implementation measures its
   `<=10 min` geometry size? The safe default is not to materialize it because
   access rows remain complete without it.

## 18. Definition of Done

The approved future implementation is complete only when it proves that:

- all nine canonical stops and every canonical merchant pair have deterministic
  analytical rows with preserved IDs/version/lineage;
- the Phase-03 primary slice and frozen 30/50-m snaps reproduce within stated
  tolerance, with no unresolved hard stop;
- connector-inclusive, unrounded 1.3-m/s shortest-path facts correctly produce
  only 5/10-minute flags and sorted discovery facts;
- unroutable cases have explicit statuses and null—not fabricated—route facts;
- 5/10-minute isochrones use canonical `duration_min` and stable method/
  fingerprint metadata; are valid EPSG:4326 polygons derived from explicit
  connector plus source-reachable undirected edge intervals; are nested; and
  contain neither untraceable disconnected islands nor misleading
  nonincident-buffer bridges;
- merchant eligibility demonstrably does not use the polygon;
- required per-stop metrics (including median time for `reachable_10min =
  true`) and transparent review flags are available, and all 9 visual QA
  records are completed PASS/REVIEW/FAIL with no unresolved review item;
- inputs remain unchanged, reruns are deterministic, and all specified
  invariants/regressions/tests pass;
- required outputs and `ROUTING_OUTPUT_SUMMARY.md` exist, no API/UI/database or
  later-phase work occurred, and any optional paths output is explicitly
  justified; and
- an implementation report records actual evidence, limitations, output hashes,
  and review findings without overstating validation.
