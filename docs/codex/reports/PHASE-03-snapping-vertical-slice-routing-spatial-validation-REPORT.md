# PHASE-03 Implementation Report

## 1. Status

**Status: PASS**

All required PHASE-03 verification checks pass: focused routing-validation tests, the complete spatial test suite, dependency integrity, production baseline execution, upstream input-hash preservation, deterministic rerun comparison, manual visual validation, and the PHASE-04 processed-output guard.

**Readiness for Next Phase: READY FOR GO NEXT REVIEW**

This is a review-readiness decision only. PHASE-04 has not started and no canonical processed snap output was generated.

## 2. Scope Implemented

- Deterministic EPSG:32749 nearest-node snapping for all nine canonical stops and 355 P0 merchants, with `(distance_m, node_id)` tie-breaking.
- Origin-independent generic snap statuses (`routable`, `snap_too_far`, `invalid_geometry`) and Simpang Dukuh-specific `primary_route_status`, including `disconnected` only as a relationship fact.
- One `networkx.single_source_dijkstra` Simpang Dukuh vertical slice on the approved undirected MultiGraph, with deterministic parallel-edge reconstruction and connector-inclusive total distance/time.
- Interim-only snap, distribution, route, case-GeoJSON, HTML, and screenshot evidence under `data/interim/p0`.
- Seven deterministic manual visual-validation cases and documented 30/50 m threshold conclusion.
- A changed-threshold guard: a proposed threshold is not ready; an approved changed threshold must be rerun under its new analysis version and manually validated before it can become ready for GO NEXT.

No PHASE-01/02 repair, graph/topology/CRS/speed/filter change, PHASE-04 precomputation, database/API/frontend work, or canonical processed snap output was performed.

## 3. Files Added

| Path | Purpose |
| --- | --- |
| `scripts/spatial/p0_routing_validation.py` | Strict loaders, deterministic snap logic, NetworkX Dijkstra, path reconstruction, interim writers, and validation HTML. |
| `tests/spatial/test_p0_routing_validation.py` | Focused tie, threshold, relationship-status, lifecycle-guard, interim-only, and synthetic pipeline coverage. |
| `data/interim/p0/phase03_stop_snaps_baseline.geojson` | Nine interim stop-snap records. |
| `data/interim/p0/phase03_merchant_snaps_baseline.geojson` | 355 interim merchant-snap records. |
| `data/interim/p0/phase03_snapping_summary.json` | Thresholds, distributions, lineage, and automated validation state. |
| `data/interim/p0/phase03_halte_simpang_dukuh_vertical_slice.json` | Simpang Dukuh relationship-level route metrics. |
| `data/interim/p0/phase03_halte_simpang_dukuh_validation_cases.geojson` | Selected cases, connectors, routes, and network context. |
| `data/interim/p0/phase03_halte_simpang_dukuh_validation.html` | Self-contained interim visual-validation overlay. |
| `data/interim/p0/phase03_halte_simpang_dukuh_validation.png` | Static screenshot used for manual review. |
| `docs/methodology/ROUTING_VALIDATION_P0.md` | Method, results, threshold conclusion, and manual-review record. |
| This report | Mandatory PHASE-03 implementation evidence. |

Git is unavailable on `PATH`; this explicit list is the Master Guide-allowed equivalent change summary.

## 4. Files Modified

| Path | Change |
| --- | --- |
| `docs/codex/plans/PHASE-03-snapping-vertical-slice-routing-spatial-validation-PLAN.md` | Planning-only clarification of the approved threshold/version rerun lifecycle before implementation. |
| `docs/codex/reports/PHASE-03-snapping-vertical-slice-routing-spatial-validation-REPORT.md` | Rewritten during final verification to this mandatory 18-section report contract. |

No PHASE-01 or PHASE-02 canonical data/graph artifact, raw source, dependency manifest, application code, or configuration file was modified.

## 5. Data Outputs Generated

All generated snap/routing outputs are PHASE-03 interim validation evidence under `data/interim/p0`; none is a canonical PHASE-04 output.

| Output | SHA-256 |
| --- | --- |
| `phase03_stop_snaps_baseline.geojson` | `BFB1323868B31BF0CFBB7A8E18793380FD97BEDB45CE15BB16EE40FD4A5C76D0` |
| `phase03_merchant_snaps_baseline.geojson` | `4D0A1CA94A9478D494CEA34CBD267657CDE4725F26B71C1C6073867A272EAF8C` |
| `phase03_snapping_summary.json` | `08F6B50C0F7263CCAA2738E1A282F981EE977324889A8AD4A78DE21F4D57EAD6` |
| `phase03_halte_simpang_dukuh_vertical_slice.json` | `76A055FD811295669CCD1A4E2BF1BDCD1A47EC7BDC95CB6D212FC1E41DDFD8DD` |
| `phase03_halte_simpang_dukuh_validation_cases.geojson` | `40E9E9B8295BD0988492EE122AA8A878730B4B30D57BB0318529C8E4A885DEEF` |
| `phase03_halte_simpang_dukuh_validation.html` | `408C62794FEECE87B66BA233C2ABA49C9ADC71AF2C3C98B8709037CCDB1413CB` |
| `phase03_halte_simpang_dukuh_validation.png` | `8F816921D1188A4E93AB3665254A814F037A4F86764562ACD2793D6C53C678C2` |

The two forbidden PHASE-04 paths do not exist: `data/processed/p0/stop_snaps_p0.geojson` and `data/processed/p0/merchant_snaps_p0.geojson`.

## 6. Database Migrations Applied

None. No database, Supabase/PostGIS connection, migration, table, index, seed, or SQL was created or executed.

## 7. API / UI Changes

None. No application API, frontend component, map layer, or product UI changed. The generated HTML/PNG are offline review evidence, not product UI.

## 8. Tests Run

The following commands were actually executed from repository root during final verification:

```powershell
& '.\.venv-spatial\Scripts\python.exe' -m unittest tests.spatial.test_p0_routing_validation -v

& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v

& '.\.venv-spatial\Scripts\python.exe' -m pip check
```

The first command ran the focused PHASE-03 suite. The second command ran the complete PHASE-01/02/03 spatial suite. The test coverage includes the specific guard that a changed threshold cannot become ready merely through approval: it must be rerun as `final-threshold-rerun`, under the approved new analysis version, and await manual review.

## 9. Test Results

| Verification | Actual result |
| --- | --- |
| Focused PHASE-03 suite | **PASS — 5 tests, 0 failures**, 0.089 s. |
| Complete spatial suite | **PASS — 13 tests, 0 failures**, 93.501 s. |
| Dependency integrity | **PASS** — `No broken requirements found.` |
| Production baseline | **PASS** — generated all six GeoJSON/JSON/HTML evidence artifacts with the 30/50 m baseline under `p0-central-v1`. |
| Deterministic rerun | **PASS** — six generated GeoJSON/JSON/HTML artifacts were byte-identical; exact command/files/hashes are in Section 14. |
| Upstream integrity | **PASS** — all four approved PHASE-01/02 hashes were unchanged before and after production/rerun execution. |
| Manual visual validation | **PASS** — seven deterministic cases inspected; no hard-stop anomaly found. |
| PHASE-04 output guard | **PASS** — processed-root rejection is tested and the two canonical PHASE-04 snap files are absent. |

## 10. Data Quality / Spatial Validation Results

### Primary and all-stop snaps

Halte Simpang Dukuh (`6a92c77152d86e03b51db962`) snapped **3.649 m** to `node_aee75159a004ab3d0235e5470ce4b55133f56028799959aaf053455f420bb6c2`, status `routable`, component `cc_000001`.

All **9/9** stops are `routable` in `cc_000001`; their maximum snap distance is **16.077 m** (minimum 3.577 m, median 5.222 m, p90 11.595 m, p95 13.836 m). The final tested stop threshold is **30 m**.

### Merchant snap distribution

The final tested merchant threshold is **50 m**. All 355 merchant geometries are valid; 336 are `routable` and 19 are `snap_too_far` (the requested `unroutable` count is therefore 19 at the generic snap gate; no invalid geometry exists).

| Metric | Result |
| --- | ---: |
| Merchant count | 355 |
| Minimum | 1.504 m |
| Median | 20.751 m |
| p90 | 44.995 m |
| p95 | 50.769 m |
| Maximum | 102.880 m |
| Count <=25 m | 216 |
| Count <=50 m | 336 |
| Count >50 m | 19 |
| Generic unroutable (`snap_too_far` or invalid) | 19 |

### Vertical-slice and connector results

One NetworkX Dijkstra run from the accepted Simpang Dukuh node produced 326 `primary_route_status = routable` merchant relationships and 10 `primary_route_status = disconnected` relationships. Those 10 are threshold-valid generic snaps in other graph components; `disconnected` is not a merchant-wide claim and does not change their generic `routing_status = routable`.

For each primary-routable result, `total_distance_m = stop_snap_distance_m + graph_shortest_path_distance_m + merchant_snap_distance_m`; time is then `total_distance_m / 1.3`. Both connectors are included, and 300/600-second bands use unrounded seconds.

### Threshold conclusion and manual cases

The final validated thresholds remain **30 m/50 m** under **`p0-central-v1`**. The p90 merchant distance remains below 50 m, while the 19 outliers extend to 102.880 m; widening solely for coverage would admit visibly long/inappropriate connectors. No analysis-version bump is proposed.

| Merchant ID / name | Selection class | Result | Total distance / time | Manual validation note |
| --- | --- | --- | --- | --- |
| `a61c933e-bde2-5a4f-b24e-c45fedfa60bf` / IMHO COFFEE | Lowest nonzero route | PASS | 50.77 m / 0.65 min | Continuous short route and local connectors in network context. |
| `3685e028-f5f7-5311-8fbb-f266c2ddb83e` / HOLLAND BAKERY | Nearest at-or-under 300 s | PASS | 378.82 m / 4.86 min | No <=300 s candidate other than near-zero case; path/connectors are continuous. |
| `ba5ff2f5-6bf1-574e-b1a9-dda87c60d899` / CHIR CHIR - TUNJUNGAN PLAZA 6 | Nearest over 300 s | PASS | 393.58 m / 5.05 min | No visible graph jump or omitted connector. |
| `e3bb05c6-1286-59f5-9096-aadc803717c5` / KFC TUNJUNGAN PLAZA 3 | Nearest 450 s | PASS | 581.84 m / 7.46 min | Continuous retained-network path. |
| `63ec8b92-9fb0-5b2e-aef4-fc2395038598` / LAPIS LEGIT SPECIAL SUKA RASA | Smallest over 600 s | PASS | 781.28 m / 10.02 min | Longer path remains graph-contiguous; connectors included. |
| `009e8a6b-2213-5674-a8e5-0e615bf94818` / P.S.I PATISSERIE | `snap_too_far` status | PASS | Not routed | 79.17 m nearest-node diagnostic retained and correctly excluded from Dijkstra. |
| `07b0d0c7-f794-5760-bdcc-fdedd028b739` / COLORS PUB & RESTAURANT | `disconnected` relationship | PASS | Not routed from primary | Generic snap is valid (24.03 m); visually separate from the primary component and correctly not made a global merchant failure. |

Evidence paths: `data/interim/p0/phase03_halte_simpang_dukuh_validation.html`, `data/interim/p0/phase03_halte_simpang_dukuh_validation.png`, `data/interim/p0/phase03_halte_simpang_dukuh_validation_cases.geojson`, and `data/interim/p0/phase03_halte_simpang_dukuh_vertical_slice.json`.

## 11. Deviations from Approved Plan

None.

The implementation uses the approved spatial logic: metric nearest-node snapping, NetworkX Dijkstra, source-specific disconnection, connector-inclusive totals, manual visual validation, 30/50 m testing/freezing, interim-only outputs, and no silent analysis-version change. The static PNG is supplemental review evidence rendered from the approved self-contained HTML; it does not alter analytical behavior.

## 12. Known Limitations

- **19 merchants** are `snap_too_far` at the final 50 m threshold; their nearest-node diagnostics remain available but they are not routed.
- **10 threshold-valid merchant snaps** are disconnected from the Simpang Dukuh component in this primary vertical slice. They are diagnostics, not merchant-wide disconnection claims; another P0 stop may reach them.
- The graph remains a road-derived walking proxy without complete pedestrian-access, sidewalk, crossing, surface, bridge/tunnel, or legal-access modelling.
- PHASE-03 validates only the Simpang Dukuh vertical slice. It does not compute all nine stop-to-merchant route matrices, reachability products, isochrones, or PHASE-04 analytical outputs.
- Nearest-node snapping is not an entrance/access-path model. No Euclidean fallback or manual node substitution is used.

## 13. Bugs / Follow-up

No PHASE-03 implementation bug or hard-stop condition emerged from the required verification set.

Follow-up remains PHASE-04 scope after GO NEXT: regenerate canonical processed stop/merchant snaps under the final approved 30/50 m thresholds and `p0-central-v1`, then evaluate full per-stop connectivity. Do not repair the 19 too-far or 10 primary-disconnected diagnostics in PHASE-03. Any future threshold change remains a PHASE-03 lifecycle event requiring review, a version bump, rerun, and final validation.

## 14. Reproduction Commands

These commands were actually executed from repository root. The hash command was run before and after production execution; the resulting four upstream hashes matched exactly.

```powershell
# Input hash check before/after execution
$items = @(
  'data\processed\p0\transit_points_p0.geojson',
  'data\processed\p0\culinary_poi_p0.geojson',
  'data\processed\p0\pedestrian_nodes.geojson',
  'data\processed\p0\pedestrian_edges.geojson'
)
Get-FileHash -Algorithm SHA256 -LiteralPath $items

# Production baseline: interim PHASE-03 evidence only
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_routing_validation.py --transit-points 'data\processed\p0\transit_points_p0.geojson' --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' --analysis-version p0-central-v1 --validation-root 'data\interim\p0' --threshold-state baseline-evaluation --overwrite

# Focused and complete test suites, then dependency integrity
& '.\.venv-spatial\Scripts\python.exe' -m unittest tests.spatial.test_p0_routing_validation -v
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v
& '.\.venv-spatial\Scripts\python.exe' -m pip check
```

The reproducibility rerun compared exactly these six files: `phase03_stop_snaps_baseline.geojson`, `phase03_merchant_snaps_baseline.geojson`, `phase03_snapping_summary.json`, `phase03_halte_simpang_dukuh_vertical_slice.json`, `phase03_halte_simpang_dukuh_validation_cases.geojson`, and `phase03_halte_simpang_dukuh_validation.html`.

```powershell
$outputs = @(
  'data\interim\p0\phase03_stop_snaps_baseline.geojson',
  'data\interim\p0\phase03_merchant_snaps_baseline.geojson',
  'data\interim\p0\phase03_snapping_summary.json',
  'data\interim\p0\phase03_halte_simpang_dukuh_vertical_slice.json',
  'data\interim\p0\phase03_halte_simpang_dukuh_validation_cases.geojson',
  'data\interim\p0\phase03_halte_simpang_dukuh_validation.html'
)
$before = Get-FileHash -Algorithm SHA256 -LiteralPath $outputs
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_routing_validation.py --transit-points 'data\processed\p0\transit_points_p0.geojson' --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' --analysis-version p0-central-v1 --validation-root 'data\interim\p0' --threshold-state baseline-evaluation --overwrite
$after = Get-FileHash -Algorithm SHA256 -LiteralPath $outputs
Compare-Object ($before | ForEach-Object { "$($_.Path)|$($_.Hash)" }) ($after | ForEach-Object { "$($_.Path)|$($_.Hash)" })
Get-FileHash -Algorithm SHA256 -LiteralPath $items
```

`Compare-Object` emitted no differences (`OUTPUTS_BYTE_IDENTICAL`). The before/after input hashes were:

```text
transit_points_p0.geojson  D15301D6230B26E93F4BDD46E9839D26E174244E6ACABCB674F1BC9956C9B06E
culinary_poi_p0.geojson    B472BB9F0E8C18A5A85FAB6783FBA2455FD5A8FECE9BAAE4B23ED42A6AD7A608
pedestrian_nodes.geojson   547A82AA6CD4B2012EE931D022948B12836236F685129EB745DB9359F417D7D3
pedestrian_edges.geojson   6A77F7722AE6F3EF4674405EAEF2E43019F6C90363063E52BEDF44F388636355
```

The manual-validation screenshot was rendered locally from the generated HTML with:

```powershell
$profile = (Resolve-Path 'data\interim\p0').Path + '\.phase03-chrome-profile-4'
$shot = (Resolve-Path 'data\interim\p0').Path + '\phase03_halte_simpang_dukuh_validation.png'
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --no-sandbox --use-gl=swiftshader --use-angle=swiftshader --disable-features=Vulkan --user-data-dir=$profile --hide-scrollbars --screenshot=$shot --window-size=1400,1400 'file:///C:/Users/akmal/Documents/College/Seventh%20Semester/MAPID-WebGIS-Competition/data/interim/p0/phase03_halte_simpang_dukuh_validation.html'
```

The temporary Chrome profile was removed after rendering; only the intentional PNG evidence remains.

## 15. Environment / Configuration Changes

None. Dependencies did not change during PHASE-03 verification; `pip check` passed. No environment variable, `.env`, runtime, deployment, database, API, or frontend configuration changed.

## 16. Security Notes

No secrets, credentials, tokens, cloud connections, external uploads, database connections, or user-data transmission were introduced. All processing and screenshot rendering used local repository artifacts. Approved PHASE-01/02 inputs were hash-checked and preserved.

## 17. Evidence for Definition of Done

| Requirement | Evidence |
| --- | --- |
| Primary stop snap validated | 3.649 m `routable` Simpang Dukuh result in Section 10 and vertical-slice JSON. |
| All nine stop snaps reported | Nine interim stop records; 9/9 `routable`, Section 10. |
| Merchant distribution reported | Complete requested distribution/count table in Section 10. |
| One Simpang Dukuh Dijkstra slice | 326 routable and 10 relationship-disconnected results in vertical-slice JSON. |
| 5–10 visual cases inspected | Seven named cases, results, distances/times, and notes in Section 10. |
| Connector-inclusive distance/time | Formula and evidence in Section 10; route tests pass. |
| Threshold conclusion documented | 30/50 m retained at `p0-central-v1`, Sections 1 and 10. |
| Hard stops absent or escalated | No hard stop found; 19/10 diagnostics explicitly retained, Section 12. |
| Methodology/report produced | `ROUTING_VALIDATION_P0.md` and this report. |
| No PHASE-04 canonical output | Processed-output guard test passes; paths are absent, Sections 5 and 9. |

## 18. Readiness for Next Phase

**Status: PASS**

**Readiness for Next Phase: READY FOR GO NEXT REVIEW**

The final validated threshold remains 30 m for stops and 50 m for merchants under `p0-central-v1`. Required tests, hash/reproducibility checks, dependency integrity, and manual visual validation pass. No hard stop emerged and no canonical PHASE-04 processed snap output exists.

Stop here for ChatGPT review. Only after `GO NEXT` may PHASE-04 generate `data/processed/p0/stop_snaps_p0.geojson` and `data/processed/p0/merchant_snaps_p0.geojson`.
