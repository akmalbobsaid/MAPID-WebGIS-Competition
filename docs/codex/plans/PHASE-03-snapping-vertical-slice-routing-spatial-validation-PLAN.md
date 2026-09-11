# PHASE-03 Plan

## 1. Goal

Plan only the spatial validation gate for deterministic snapping and one single-source Dijkstra vertical slice from canonical stop "6a92c77152d86e03b51db962" (Halte Simpang Dukuh). The later phase must validate all nine stops, all P0 merchants, connector-inclusive distances, and visually plausible routes before PHASE-04. This plan does not claim any snapping/routing result or PHASE-03 PASS.

## 2. In Scope

- Consume, never rebuild, PHASE-01 canonical transit/culinary GeoJSON and PHASE-02 node/edge GeoJSON.
- Validate schema, CRS/version/lineage, graph endpoints, positive edge lengths, components, IDs, and primary source.
- Implement deterministic metric nearest-node snapping: primary stop first, then nine stops and all merchants.
- Evaluate 30 m stop and 50 m merchant baselines without silently changing them.
- Build one undirected length-weighted NetworkX MultiGraph, run one Dijkstra from the accepted primary node, and reconstruct actual paths/connectors.
- Generate 5–10 deterministic offline visual validation cases; add focused tests, method, and report after execution.

## 3. Explicitly Out of Scope

- PHASE-04 complete reachability, complete stop-merchant-access data, isochrones, or a 15-minute threshold.
- Euclidean fallback; dynamic/current-location/multimodal routing; database, API, frontend/MAPID, AGUS, Access Quality, ranking, P1 work, or unrelated refactors.
- Mutation/rebuild of raw data, PHASE-01 canonical data, PHASE-02 graph/topology/filtering/IDs, walking speed, study extent, or upstream source.
- Changing thresholds solely for coverage or installing dependencies.

## 4. Current Repository Findings

| Evidence | Concrete PHASE-03 finding |
| --- | --- |
| Repository structure | Spatial code is in "scripts/spatial", tests in "tests/spatial", output under "data/processed/p0" and "data/interim/p0". No PHASE-03 module, test, output, or methodology exists. |
| Git inspection/reporting | ".git" is present but "git" is unavailable on PATH, so status/diff could not be collected. No clean-worktree claim is made. The later implementation report must use `git diff --stat` when Git is available, or the Master Guide-allowed equivalent file-change summary when it remains unavailable. |
| PHASE-00 | "docs/codex/decisions/P0_TECHNICAL_FREEZE.md" exists. It freezes raw/API/web EPSG:4326, metric EPSG:32749, 1.3 m/s, "p0-central-v1", offline Dijkstra, primary stop ID, and initial 30/50 m thresholds. Its plan/report exist. |
| PHASE-01 | Its implementation report records PASS. "transit_points_p0.geojson" has 9 canonical EPSG:4326 stops; "culinary_poi_p0.geojson" has 355 canonical EPSG:4326 merchants. Both metadata values are "p0-central-v1". The primary feature exists with exact ID and coordinates [112.7419137,-7.2630167]. |
| PHASE-02 | Its report records PASS, explicitly excluding snapping/routability. Nodes/edges exist and declare an undirected multigraph, output EPSG:4326, metric EPSG:32749, and "p0-central-v1". |
| Actual graph | 13,616 node features and 14,818 edge features exist. Node fields: component_id, node_id, x_m, y_m. Edge fields include edge_id, source_node, target_node, length_m, cost_seconds, and geometry. Reported components: 73; largest: 12,947 nodes (95.0867%). |
| Deterministic graph behavior | "p0_walking_graph.py" builds NetworkX MultiGraph, retains parallel edges, assigns SHA-256 IDs, canonically orders endpoints, and assigns component IDs ordered by minimum node ID. It validates positive lengths and cost_seconds = length_m / 1.3. |
| Visual capability | Existing "data/interim/p0/pedestrian_graph_coverage_diagnostic.html" and PNG are deterministic dependency-free SVG/HTML QA. This pattern can render validation output, but existing output deliberately performs no snapping or routing. |
| Environment/tests | Requirements pin GeoPandas 1.1.4, Shapely 2.1.2, pyproj 3.8.0, NetworkX 3.6.1. Current unittest tests use temp directories, deterministic byte hashes, and input-hash guards. |
| Master Guide evidence | Repository search found no standalone Master Technical Implementation Guide file. The supplied Master Guide/brief is the source of truth for this task; its frozen values are corroborated by the freeze and approved artifacts. |

The Phase-02 visual overlay shows graph context around all stops but is not proximity/component/routability evidence. PHASE-03 is needed. The actual prior-phase artifacts appear suitable for PHASE-03 planning; execution preflight must re-verify them.

## 5. Source Files / Data Inputs

| Input | Actual path and contract | Later use |
| --- | --- | --- |
| Canonical stops | "data/processed/p0/transit_points_p0.geojson"; 9 EPSG:4326 Points, canonical stop_id and display-only stop_name; PHASE-01 source is "data/raw/transit/SurveiActivities.GeoJSON". | Locate primary only by exact stop_id; snap all nine. |
| Canonical merchants | "data/processed/p0/culinary_poi_p0.geojson"; 355 EPSG:4326 Points, deterministic merchant_id and merchant_name; PHASE-01 source is "data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson". | Snap every merchant without ID regeneration. |
| Pedestrian nodes | "data/processed/p0/pedestrian_nodes.geojson"; EPSG:4326 Points plus EPSG:32749 x_m/y_m, node_id, component_id. | Metric nearest-node calculation and components. |
| Pedestrian edges | "data/processed/p0/pedestrian_edges.geojson"; EPSG:4326 LineStrings plus edge_id, source_node, target_node, length_m, cost_seconds and road provenance. | Frozen MultiGraph, Dijkstra cost, actual path reconstruction. |
| Phase-02 method/output | "docs/methodology/WALKING_NETWORK_METHOD.md" and coverage HTML. | Preserve graph topology/cost model and reuse compatible offline validation rendering. |

Preflight requires nonempty collections, exact 9 stops, unique canonical IDs, finite valid Point/LineString geometries, output CRS EPSG:4326, graph metric CRS EPSG:32749, all analysis versions "p0-central-v1", node component IDs, positive finite edge length/cost, endpoint references, and cost_seconds equal to length_m / 1.3. Check node x_m/y_m against transformed node geometry and record source hashes/metadata. Any inconsistency is a hard failure; PHASE-03 will not repair PHASE-01/02.

## 6. Assumptions

### Verified facts

- "p0-central-v1" is the current frozen value on data and graph artifacts.
- The exact primary ID and frozen point are present in canonical output.
- PHASE-02 is an undirected MultiGraph proxy with parallel-edge preservation and components; vehicle oneway is audit metadata, not pedestrian direction.
- Existing pinned environment includes NetworkX, Shapely, and pyproj.

### Assumptions requiring implementation-time verification

- Input hashes/schemas/lineage remain consistent at execution time.
- Stored node metric coordinates agree with EPSG:4326 geometry after always_xy transformation; degrees-like coordinates are a failure.
- Current component size/rank remains reported; calculate from loaded graph instead of trusting the report.
- Baselines begin at 30/50 m. PHASE-03 must test and freeze the final snapping thresholds, documenting its conclusion in the required methodology and implementation report. If ChatGPT approves a changed threshold and analysis version, PHASE-03 reruns and validates that final value under the newly approved version before it can claim readiness. It never creates or promotes PHASE-04 processed snap outputs.
- GeoJSON plus self-contained SVG/HTML can clearly show all required review context. Escalate before adding heavy dependencies.

## 7. Proposed Changes

Add the smallest separate PHASE-03 offline module and tests; do not alter PHASE-01/02 behavior. Reuse stable projection, validation, hash, and atomic-write helpers from "p0_ingestion.py" only where suitable.

PHASE-03 is a validation gate. It evaluates the current 30 m / 50 m baseline and writes only clearly labelled interim validation evidence: "data/interim/p0/phase03_stop_snaps_baseline.geojson" and "data/interim/p0/phase03_merchant_snaps_baseline.geojson". These files support the nine-stop report, merchant distribution, Simpang Dukuh vertical slice, manual spatial review, and threshold conclusion. They are not production/canonical PHASE-04 analytical outputs and are never promoted to processed paths by PHASE-03.

Every snap feature retains original Point geometry and canonical stop_id or merchant_id. For every valid geometry, including a threshold failure, node_id is the deterministic nearest candidate and snap_distance_m is its measured metric distance. Those two values may be null only for invalid_geometry. Generic routing_status is origin-independent: it states snap eligibility, never reachability from Halte Simpang Dukuh or any other stop. Required audit properties are component_id, threshold_m, analysis_version, and graph/input lineage; source display name may be retained. Failure records are never omitted.

Proposed validation-only outputs:

- "data/interim/p0/phase03_snapping_summary.json": hashes/versions, nine-stop table, merchant statistics, component evidence, and threshold-conclusion evidence.
- "data/interim/p0/phase03_halte_simpang_dukuh_validation_cases.geojson": stop/merchant/snap points, connector/path/context features tagged with artifact_role.
- "data/interim/p0/phase03_halte_simpang_dukuh_validation.html": self-contained visual overlay generated from those records.
- "data/interim/p0/phase03_halte_simpang_dukuh_vertical_slice.json": origin-specific route metrics and `primary_route_status`; it is not a generic merchant snap artifact.
- "docs/methodology/ROUTING_VALIDATION_P0.md": inputs/version, method, baseline/final decision, snap results/statistics, vertical slice, required manual-review evidence, anomalies, limits, PHASE-04 safety conclusion.
- "docs/codex/reports/PHASE-03-snapping-vertical-slice-routing-spatial-validation-REPORT.md": run/test/hash/blocker/readiness evidence.

PHASE-03 records baseline values, observed distributions, final proposed/frozen values, justification, and analysis-version implications in "ROUTING_VALIDATION_P0.md" and the implementation report. If evidence confirms 30/50 m, it may complete validation and report readiness for GO NEXT review under "p0-central-v1". If a threshold change is supported, retain the baseline records as interim evidence and report PHASE-03 as PARTIAL (or otherwise explicitly not ready for PHASE-04) pending ChatGPT review: state the old/new values, affected IDs/counts, statistical/visual evidence, spatial risks, and required analysis-version bump. Do not silently apply the change or claim PHASE-04 readiness. If ChatGPT approves the analytical change, remain in PHASE-03: rerun affected interim validation under the approved version, test the new final threshold itself, regenerate relevant evidence, recompute distributions/counts, rerun the Simpang Dukuh slice and manual cases where affected, and update both required documents. Only a passing rerun may be submitted again for GO NEXT. PHASE-04 owns canonical processed snap generation only after that GO NEXT. An extreme threshold requirement remains BLOCKED. Immutable PHASE-01/02 artifacts remain approved inputs with their existing hashes/versions as lineage; a threshold-only bump does not mutate or relabel them.

## 8. Files to Create / Modify

### This planning pass

- "docs/codex/plans/PHASE-03-snapping-vertical-slice-routing-spatial-validation-PLAN.md" only.

### Later implementation pass

| Path | Change | Reason |
| --- | --- | --- |
| "scripts/spatial/p0_routing_validation.py" | Create strict loaders/validators, snapping, graph loading, Dijkstra, stable path reconstruction, writers/statistics, HTML/GeoJSON artifact rendering. | No existing PHASE-03 logic. |
| "tests/spatial/test_p0_routing_validation.py" | Create synthetic/temporary-directory unit/integration tests. | Existing tests stop at graph construction. |
| "data/interim/p0/phase03_stop_snaps_baseline.geojson" and "data/interim/p0/phase03_merchant_snaps_baseline.geojson" | Create/regenerate during baseline validation only. | Clearly labelled PHASE-03 validation evidence, never canonical processed outputs. |
| Remaining interim artifacts in Section 7 | Create/regenerate during approved validation. | Origin-specific and visual evidence, not competing canonical datasets. |
| "docs/methodology/ROUTING_VALIDATION_P0.md" | Create after implementation. | Required methodology artifact. |
| PHASE-03 report path in Section 7 | Create after implementation. | Evidence and gate conclusion. |

No change is planned to existing ingestion/graph code/tests, requirements, upstream output, app, or configuration. A genuine upstream defect is a reviewed escalation, not a refactor opportunity.

## 9. Data / DB Schema Impact

API Contract Impact: none expected. UI Impact: none expected. No database/migration/table/index/Supabase/API change is planned.

The GeoJSON contracts retain canonical stop_id/merchant_id, never names as keys. The reusable snap collections are origin-independent. Their routing_status is a snap-validity status, not a statement that a merchant is reachable from Halte Simpang Dukuh or unreachable from every P0 stop. Status semantics are:

| Status | Meaning |
| --- | --- |
| routable | Valid geometry has a deterministic nearest node at or below the applicable threshold, and that node is a valid graph node with component metadata. It means eligible to be evaluated from an origin; it does not promise connectivity from any particular stop. |
| snap_too_far | Valid geometry has a deterministic nearest candidate but exceeds threshold. Preserve node_id and snap_distance_m as diagnostics, but it is not an accepted connector and must never be used by Dijkstra/reachability. |
| disconnected | Reserved for an origin-specific connectivity relationship, not a generic stop_snaps/merchant_snaps routing_status. In PHASE-03 it may appear only as `primary_route_status = disconnected` for an accepted merchant node outside the primary origin's component; later PHASE-04 records it per stop-merchant relationship. |
| invalid_geometry | Geometry is absent, non-Point, empty, invalid, non-finite, or fails transformation. node_id and snap_distance_m are null because no nearest-node calculation exists. |

A generic PHASE-03 validation snap collection therefore emits routable, snap_too_far, or invalid_geometry based only on the candidate and threshold. It never labels a merchant disconnected simply because Simpang Dukuh cannot reach it. This preserves the Master Guide minimum vocabulary: `routable`, `snap_too_far`, `disconnected`, and `invalid_geometry`. The vertical-slice evidence separately records `primary_route_status`: `routable` when an accepted merchant node is in the primary component and has a Dijkstra result; `disconnected` when an accepted node is in another component; null when generic routing_status is snap_too_far or invalid_geometry. `disconnected` is therefore a source-specific relationship in PHASE-03, never a permanent merchant-wide fact. PHASE-04 will materialize canonical routing statuses consistently with per-stop connectivity in its full analytical outputs. A missing/invalid/>30 m/obviously wrong-component primary stop is BLOCKED. A too-far merchant remains snap_too_far even if its nearest candidate shares source component.

## 10. Algorithms / Processing Details

### A. Strict load/preflight

1. Load all four FeatureCollections and validate metadata, IDs, geometry, graph fields/endpoints/costs, and lineage.
2. Locate primary by exact stop_id, never stop_name. Transform EPSG:4326 points via established always_xy EPSG:32749 conversion. Verify stored x_m/y_m against transformed node geometry.
3. Reconstruct the already-pinned NetworkX MultiGraph keyed by edge_id, weighted with length_m, retaining complete edge records and geometry. Insert nodes in sorted node_id order and edges in deterministic (source_node, target_node, edge_id) order so NetworkX's standard path tie behavior is reproducible. Compute component sizes/ranks from loaded graph.
4. Hash the four inputs before/after and record them. Reject input mutation; never overwrite input paths.

### B. Snapping

For each valid metric Point, calculate Euclidean distance to every node x_m/y_m, or use a deterministic index then recheck candidate distance exactly. This is nearest-node, not road-segment, snapping. Sort candidates by "(distance_m, node_id)" for deterministic ties and apply thresholds to full precision before formatting.

Process Halte Simpang Dukuh first. Record stop_id, node_id, snap_distance_m, component_id, origin-independent routing_status, threshold, analysis_version, lineage. Require generic routing_status = routable at <=30 m, then inspect component size/rank/context. Otherwise BLOCKED: do not manually choose another node or raise threshold.

After source passes, emit exactly nine origin-independent stop snap records in canonical order. Flag components outside the primary/largest component and small components with size/rank evidence, not a source-dependent generic status. Process merchants in sorted merchant_id order at 50 m and emit all records. Compute min, median, p90, p95, max, counts <=25 m, <=50 m, >50 m, generic non-routable count, routable percentage, and component distribution. Document percentile implementation.

### C. Dijkstra, total distance, time

Use NetworkX's existing `single_source_dijkstra` once from the accepted primary node with "length_m" weight. Deterministic graph insertion is the default reproducibility mechanism; do not implement a custom Dijkstra relaxation routine unless an implementation-time reproducibility test proves the standard implementation insufficient and the documented deviation is reviewed. For generic merchant snap records with routing_status = routable:

~~~
graph_shortest_path_distance_m = source-to-merchant-node Dijkstra distance
total_distance_m = stop_snap_distance_m + graph_shortest_path_distance_m + merchant_snap_distance_m
walking_time_seconds = total_distance_m / 1.3
walking_time_min = walking_time_seconds / 60
~~~

No Euclidean route replacement and no omitted connector. Classify using unrounded seconds: <=300, >300 and <=600, >600. Round display only.

If that merchant's node shares the primary component, write origin-specific `primary_route_status = routable` and calculate the values above. If it belongs to a different component, retain generic routing_status = routable, write `primary_route_status = disconnected`, and leave graph/total/time null; it may still be routable from another P0 stop. For generic invalid_geometry or snap_too_far records, `primary_route_status` and graph/total/time are null. An accepted same-component node absent from Dijkstra is a graph-consistency hard failure.

### D. Path reconstruction and visual validation

Use the NetworkX node path returned by Dijkstra. For each consecutive node pair, inspect its traversable parallel edges and select the minimum-length edge; if multiple have that length, tie-break by edge_id. This matches MultiGraph length-weight semantics and is deterministic because graph insertion is sorted. Ensure each selected edge connects its successive nodes. Reverse stored LineString coordinate orientation for undirected reverse traversal; concatenate in route order. Confirm selected edge lengths equal the NetworkX shortest-path distance within documented tolerance. A disagreement is a hard failure, not a reason to substitute a custom route.

Generate EPSG:4326 GeoJSON roles for canonical stop, source snapped node, canonical merchant, merchant snapped node, stop_snap_connector, merchant_snap_connector, graph_route, and road/network context. Connectors are clearly styled/labeled as diagnostics, not road edges; computations remain metres in EPSG:32749.

Select 5–10 cases after baseline results deterministically: lowest nonzero route, nearest to 300 seconds on each available side, a 300–600 case closest to 450 seconds, smallest >600 seconds, and each non-routable status if present, up to 10. Tie-break merchant_id. If a group is absent, document it and use next deterministic quantile; do not cherry-pick. Every case records IDs/name, connector distances, graph/total distance, time, route reference, expected plausibility, result, and notes.

The script may generate metrics, a case manifest, GeoJSON, network context, and self-contained HTML, but it may not auto-generate a spatial-plausibility PASS. Codex must inspect each 5–10 visual overlays and then record expected plausibility, observed route behavior, validation result, notes, and relevant suspicious crossing/component/bridge/tunnel/layer evidence. Only that completed manual record permits ROUTING_VALIDATION_P0.md or the implementation report to claim the vertical slice spatially plausible. An absurd route/crossing is BLOCKED for PHASE-02 review; do not change topology here.

### E. Threshold/version lifecycle

1. Run baseline snapping at 30 m for stops and 50 m for merchants, writing only interim PHASE-03 validation evidence.
2. Inspect the complete distributions, each outlier, component evidence, and the 5–10 completed visual cases, including inappropriate snaps a larger threshold might permit.
3. If evidence supports retaining 30/50 m, document that conclusion in "docs/methodology/ROUTING_VALIDATION_P0.md" and the PHASE-03 implementation report, complete PHASE-03 validation under "p0-central-v1", and submit it for GO NEXT review.
4. If evidence supports changing either threshold, PHASE-03 remains PARTIAL/not ready for PHASE-04. Report the old/new values, evidence, affected record counts, spatial risks, and required analysis-version bump, then stop for ChatGPT review of the proposed analytical change.
5. If ChatGPT approves the change, remain in PHASE-03 and rerun affected interim validation under the newly approved analysis_version. Test the new final threshold itself; regenerate relevant interim snap evidence; recompute snap distributions and affected counts; rerun the Simpang Dukuh vertical slice when the changed threshold can affect its source or selected merchant connectors; and rerun/review each affected manual spatial-validation case. Verify that the new value creates no inappropriate snapping and does not otherwise violate PHASE-03 spatial plausibility. Update "docs/methodology/ROUTING_VALIDATION_P0.md" and the PHASE-03 implementation report with final threshold/version evidence.
6. Only after that rerun passes may PHASE-03 be submitted again for GO NEXT.
7. After PHASE-03 receives GO NEXT, PHASE-04 owns regeneration and writing of "data/processed/p0/stop_snaps_p0.geojson" and "data/processed/p0/merchant_snaps_p0.geojson" using the final PHASE-03-approved threshold and analysis_version.

An extreme threshold requirement remains BLOCKED. A change to threshold, speed, topology, filter, study area, or raw source requires explicit review/version decision. No processed-output promotion belongs in PHASE-03.

## 11. API Contract Impact

None expected. PHASE-03 is offline validation, with no endpoint, request/response schema, dynamic routing, or client reachability behavior.

## 12. UI Impact

None expected. The HTML is an offline review artifact, not a Next.js/MAPID product interface and requires no frontend dependency.

## 13. Tests and Validation

### Automated tests

New tests must cover:

- Exact primary stop-ID lookup; duplicate/missing primary failure; no name matching.
- EPSG:4326 input/EPSG:32749 metric operation; a degree-distance fixture cannot pass metric assertions.
- Deterministic nearest node including equal-distance node_id tie; exact and just-over 30/50 m; invalid geometry; and snap_too_far retention of deterministic node_id/snap_distance_m while routing remains prohibited.
- Exactly nine stop records and all canonical IDs preserved; no omitted failed records.
- Origin-independent versus source-specific status: a merchant outside Simpang Dukuh's component retains generic routing_status = routable when its threshold-valid snap is sound, while only the vertical-slice record is primary_route_status = disconnected; source invalid/too-far still blocks the slice.
- Graph schema/version/endpoints/components/positive length and parallel-edge fixtures.
- NetworkX Dijkstra zero source distance, nonnegative graph lengths, length_m cost, unreachable retention, deterministic graph insertion, and reconstruction using the minimum-length/edge_id-tied parallel edge whose total equals NetworkX distance.
- Contiguous/oriented path and edge-length sum; connector feature not graph edge.
- Both connectors in total formula, 1.3 m/s, unrounded 300/600 classification.
- PHASE-03 writes only the named interim evidence paths and rejects any attempt or option to write "data/processed/p0/stop_snaps_p0.geojson" or "data/processed/p0/merchant_snaps_p0.geojson".
- Threshold/version lifecycle guard: a proposed new threshold is PARTIAL/not-ready-for-PHASE-04 pending ChatGPT approval and required version bump; approval alone cannot produce PHASE-03 readiness. Readiness must fail until the approved new value has been rerun under its new analysis_version, its interim evidence/distributions/affected counts have been regenerated, affected slice/manual checks have been rerun, and final methodology/report evidence has been recorded.
- Byte-stable snaps, routes, selected cases, JSON/GeoJSON/HTML, and unchanged input hashes over temporary-directory reruns.
- Automated generation leaves manual spatial-review fields pending and cannot write a plausibility PASS. Final methodology/report validation requires explicit manually recorded observed route behavior, validation result, and notes for every selected case.

### Execution validation

Run focused tests, full spatial suite, dependency integrity, input hash checks, schema/count/lineage audit, and temporary-output deterministic reruns. When a threshold change is approved, run the affected PHASE-03 validation again under the approved analysis_version and do not treat the baseline run as final evidence. Do not use canonical processed outputs or their overwrite as reproducibility evidence.

### Manual spatial validation

Codex must visually inspect each of the 5–10 deterministic overlays. Numeric checks are insufficient. For each case it must record expected plausibility, observed route behavior, PASS/FAIL/BLOCKED validation result, notes, and relevant crossing/component/bridge/tunnel/layer evidence, with the artifact reference. The script may create a pending case manifest but may not fill a plausibility PASS. Only completed human/Codex visual inspection supports spatial-plausibility language in the methodology/report.

Treat missing/inconsistent PHASE-01/02 data; graph/CRS/schema failures; primary failure; several stop failures; extreme threshold pressure; metre/degree symptoms; absurd nearby route; invalid crossings; topology change requirement; or tests that pass only after an unsupported threshold change as BLOCKED. Escalate PHASE-02 rather than repair it.

## 14. Commands Codex Plans to Run

### Commands actually used during planning inspection

~~~
Get-Content -Raw 'C:\Users\akmal\.codex\attachments\044a7b05-98ba-427f-965e-7c0c68161b61\pasted-text.txt'
Get-ChildItem -Force
rg --files -g '!*node_modules*' -g '!*.lock'
git status --short
git diff --stat
Get-Content -Raw 'docs\codex\decisions\P0_TECHNICAL_FREEZE.md'
Get-Content -Raw 'docs\methodology\WALKING_NETWORK_METHOD.md'
Get-Content -Raw 'docs\data\P0_DATA_DICTIONARY.md'
Get-Content -Raw 'docs\codex\reports\PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md'
Get-Content -Raw 'docs\codex\reports\PHASE-01-canonical-data-ingestion-study-area-REPORT.md'
Get-Content -Raw 'docs\codex\reports\PHASE-02-walking-proxy-graph-construction-REPORT.md'
Get-Content -Raw 'scripts\spatial\p0_ingestion.py'
Get-Content -Raw 'scripts\spatial\p0_walking_graph.py'
Get-Content -Raw 'tests\spatial\test_p0_ingestion.py'
Get-Content -Raw 'tests\spatial\test_p0_walking_graph.py'
Get-Content -Raw 'scripts\spatial\requirements.txt'
rg -n "^(def|class) |networkx|MultiGraph|component|atomic_write|validate_" scripts\spatial\p0_walking_graph.py
rg -n -i "master technical|implementation guide|phase-03|snapp|dijkstra|routing validation" . -g '!data/raw/**'
~~~

Git commands failed only because git is unavailable on PATH. Read-only PowerShell JSON parsing additionally counted features, inspected metadata/fields, located primary, and summarized components.

### Commands proposed for later implementation/testing

~~~
$items = @(
  'data\processed\p0\transit_points_p0.geojson',
  'data\processed\p0\culinary_poi_p0.geojson',
  'data\processed\p0\pedestrian_nodes.geojson',
  'data\processed\p0\pedestrian_edges.geojson'
)
Get-FileHash -Algorithm SHA256 $items

# Baseline evaluation: produces PHASE-03 interim validation evidence only;
# it must not create a processed snap handoff.
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_routing_validation.py --transit-points 'data\processed\p0\transit_points_p0.geojson' --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' --analysis-version p0-central-v1 --validation-root 'data\interim\p0' --validation-html 'data\interim\p0\phase03_halte_simpang_dukuh_validation.html' --methodology 'docs\methodology\ROUTING_VALIDATION_P0.md' --threshold-state baseline-evaluation --overwrite

& '.\.venv-spatial\Scripts\python.exe' -m unittest tests.spatial.test_p0_routing_validation -v
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v
& '.\.venv-spatial\Scripts\python.exe' -m pip check
Get-FileHash -Algorithm SHA256 $items
Get-Content -Raw 'data\interim\p0\phase03_snapping_summary.json'
~~~

The CLI is proposed, not present. No output-generating pipeline/test or package installation was run during planning.

## 15. Risks / Failure Modes

| Risk | Detection | Mitigation / escalation |
| --- | --- | --- |
| CRS/degrees treated as metres | Metadata/metric-web coordinate checks, known-value test, implausible ranges. | Fail loud; no degree fallback. |
| Wrong-side/irrelevant nearest node | Connector/component/context and visual outlier review. | Surface limitation; never manually select preferred node. |
| Primary on wrong/small component | Component rank/size plus overlay. | BLOCKED before Dijkstra. |
| Primary-origin connectivity leaks into generic snaps | Compare generic routing_status with source-specific primary_route_status fixtures. | Keep `disconnected` only on the primary vertical-slice relationship; never persist a merchant as globally disconnected because one origin cannot reach it. |
| Threshold-failed candidate is discarded or routed | Boundary fixtures and output-schema audit verify node_id/distance are retained and never enter Dijkstra. | Retain diagnostics for valid geometry; prohibit it as a connector. |
| Precision/tie variance | Sort nearest candidates by distance/node_id; insert graph nodes/edges deterministically; reconstruct min-length then edge_id parallel edge; rerun. | Test/reject nondeterministic output; use custom Dijkstra only after demonstrated NetworkX failure and reviewed documentation. |
| Parallel-edge path error | Retain edge_id and validate endpoints/orientation/length sum. | Reject invalid reconstructed path. |
| Version/lineage mismatch | Strict preflight/hashes. | Stop; never mix generations/bump version silently. |
| Connector omission | Formula/output audit. | Fail before reporting time. |
| Rounding changes band | Unrounded boundary tests. | Separate analytical/display values. |
| Threshold masks gap, interim baseline looks canonical, or an approved changed value bypasses final validation | Distribution/outlier/component/visual evidence, explicit interim labelling, threshold/version lifecycle guard, and methodology/report review. | Keep records under "data/interim/p0" as PHASE-03 validation evidence. A modest change is PARTIAL/pending ChatGPT approval/version bump; after approval, remain in PHASE-03 until the new value is rerun and spatially validated under its new version. Extreme pressure is BLOCKED. PHASE-04 alone writes canonical processed outputs after GO NEXT. |
| False graph/grade crossing | Route review plus bridge/tunnel/layer provenance. | BLOCKED PHASE-02 review; no noding/union repair. |
| Cherry-picked routes | Deterministic selection manifest. | Required groups or documented absent group/substitute. |
| Upstream mutation | Input hashes, restricted writes, temp tests. | Stop and preserve upstream. |
| Git evidence unavailable | Check for Git before implementation report. | Use `git diff --stat` when available or the Master Guide-allowed equivalent change summary when it is not. |

## 16. Rollback / Recovery

This planning pass changes only this plan; review rejection reverts only this file.

Later work writes atomically only to named PHASE-03 interim/docs paths during baseline evaluation, rejects raw-data and canonical processed snap targets, and never mutates canonical transit/culinary or graph output. Tests use temp directories. Recovery removes/replaces only clearly named PHASE-03 interim artifacts after target review then reruns deterministically; raw and approved PHASE-01/02 artifacts retain their versions/hashes and remain untouched. PHASE-04 owns any later canonical processed snap output under the approved threshold/version.

## 17. Open Questions

None. The supplied Master Guide is the source of truth. It reserves "data/processed/p0/stop_snaps_p0.geojson" and "data/processed/p0/merchant_snaps_p0.geojson" for PHASE-04, while this plan uses only labelled PHASE-03 interim evidence; Git availability is an environment/reporting limitation documented in repository findings and risks.

## 18. Definition of Done

Planning is complete when repository evidence, actual PHASE-01/02 paths/contracts/readiness, frozen EPSG:32749/1.3 m/s/"p0-central-v1" and 30/50 m baseline assumptions, origin-independent snap versus primary-origin connectivity semantics, deterministic NetworkX Dijkstra/path/connector design, interim-evidence threshold/version lifecycle, tests/manual review/hard stops, recovery, and exact future files are recorded without implementing the phase.

PHASE-03 itself is complete only after approved execution has:

- validated the primary stop snap;
- reported all nine stop snaps;
- reported the merchant snap distribution;
- completed one Simpang Dukuh NetworkX Dijkstra vertical slice;
- manually/visually inspected 5–10 deterministic cases;
- validated connector-inclusive distance and time;
- documented the threshold conclusion;
- if a threshold changed after review, rerun and validated that approved final threshold under its approved analysis_version, including all affected evidence, distribution/count, vertical-slice, and manual-review work;
- confirmed hard-stop conditions are absent or explicitly escalated;
- produced "docs/methodology/ROUTING_VALIDATION_P0.md"; and
- produced the PHASE-03 implementation report.

No PHASE-04 full precomputation or canonical processed snap outputs may be generated in PHASE-03. If 30/50 m remain supported, the report may state readiness for ChatGPT review under "p0-central-v1". If a changed threshold is proposed, the report is PARTIAL or otherwise explicitly not ready for PHASE-04 pending ChatGPT review and the required version bump. ChatGPT approval returns work to PHASE-03, not directly to PHASE-04: PHASE-03 can be submitted again for GO NEXT only after the approved new threshold itself has passed its required rerun and final validation. "ROUTING_VALIDATION_P0.md" and the report may claim spatial plausibility only after manual visual records are complete. This plan makes no PASS, spatial-validity, or PHASE-04-readiness claim.
