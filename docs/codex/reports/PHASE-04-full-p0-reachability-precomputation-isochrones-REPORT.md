# PHASE-04 Implementation Report

## 1. Status

**PASS.** The frozen `p0-central-v1` analytical outputs, authoritative metric-CRS nesting validation, Phase-03 regression, deterministic rerun, and all-stop manual visual QA pass. PHASE-05 was not started.

## 2. Scope Implemented

- Reproduced 30 m stop / 50 m merchant snaps and ran one full NetworkX Dijkstra per routable stop on the approved undirected graph.
- Materialized connector-inclusive 5/10-minute facts for all 9 x 355 pairs and 18 network isochrones.
- Generated browser-independent static PNG review artifacts from existing canonical outputs only.

## 3. Files Added

Git is unavailable on `PATH`; this is the explicit equivalent change summary.

| Path | Purpose |
| --- | --- |
| `scripts/spatial/p0_reachability_precompute.py` | PHASE-04 precompute, Phase-03 regression, fingerprint/overwrite, and metric nesting validation. |
| `scripts/spatial/p0_phase04_static_qa.py` | Standard-library static PNG renderer; reads outputs only. |
| `tests/spatial/test_p0_reachability_precompute.py` | PHASE-04 interval, bridge, renderer, fingerprint, and nesting tests. |
| `data/processed/p0/stop_snaps_p0.geojson` | 9 canonical stop snaps. |
| `data/processed/p0/merchant_snaps_p0.geojson` | 355 canonical merchant snaps. |
| `data/processed/p0/stop_merchant_access.geojson` | 3,195 canonical pair rows. |
| `data/processed/p0/stop_isochrones.geojson` | 18 canonical 5/10-minute isochrones. |
| `data/interim/p0/phase04_isochrone_validation.geojson` | All-stop visual overlay. |
| `data/interim/p0/phase04_isochrone_validation.html` | All-stop HTML QA artifact. |
| `data/interim/p0/phase04_isochrone_visual_review.json` | Completed manual-review evidence. |
| `data/interim/p0/phase04_isochrone_static_manifest.json` | Nine-PNG artifact manifest. |
| `data/interim/p0/phase04_isochrone_png/phase04_isochrone_*.png` | Nine per-stop static review images. |
| `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` | Method/metrics/QA summary. |
| This report | Implementation and acceptance evidence. |

## 4. Files Modified

| Path | Actual modification |
| --- | --- |
| `scripts/spatial/p0_reachability_precompute.py` | Added explicit reusable `metric_nesting_excess_m2` and same-fingerprint `--preserve-manual-review` rerun support. Neither alters method or geometry. |
| `tests/spatial/test_p0_reachability_precompute.py` | Added square-metre tolerance coverage. |
| `data/interim/p0/phase04_isochrone_visual_review.json` | Replaced generated REVIEW placeholders with 9 actual PASS reviews. |
| `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` | Added static-PNG QA method and final review outcome. |
| `docs/codex/plans/PHASE-04-full-p0-reachability-precomputation-isochrones-PLAN.md` | Planning revisions before implementation. |
| This report | Rewritten to the required 18-section structure. |

`scripts/spatial/p0_routing_validation.py` and `tests/spatial/test_p0_routing_validation.py` were inspected/reused but no PHASE-04 patch was applied. No Phase-01/02 source, graph script, or graph test was modified.

## 5. Data Outputs Generated

| Output | Count | SHA-256 |
| --- | ---: | --- |
| `stop_snaps_p0.geojson` | 9 | `8B47AA135124C827E503F1A89BBFF7C74B8A41E41CA10E9CA74A905BEDD59D5C` |
| `merchant_snaps_p0.geojson` | 355 | `6CD5462F58C981FBF7F88D884D5D22406A33D2486DF8DFE51455D66925E93588` |
| `stop_merchant_access.geojson` | 3,195 | `225CA24F339FFEEDAF00B91C1E0C14617AE18554FC5BEB3AF2DB49128974EDDB` |
| `stop_isochrones.geojson` | 18 | `3945967014118A15061325D49A3F65FCCA4C12903A9A2A5A508671C17B3178AB` |

`paths.geojson` was intentionally omitted: it is optional, does not determine eligibility, and would add unnecessary storage while all access facts are already complete.

## 6. Database Migrations Applied

None. No database, PostGIS/Supabase connection, SQL, migration, table, index, seed, or ingest was created.

## 7. API / UI Changes

None. HTML and PNG files are offline QA artifacts, not application UI. No API, Next.js route, frontend component, map integration, or client routing was changed.

## 8. Tests Run

Actual commands run from repository root included:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath `
  'data\processed\p0\transit_points_p0.geojson', `
  'data\processed\p0\culinary_poi_p0.geojson', `
  'data\processed\p0\pedestrian_nodes.geojson', `
  'data\processed\p0\pedestrian_edges.geojson'

& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_reachability_precompute.py `
  --transit-points 'data\processed\p0\transit_points_p0.geojson' `
  --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' `
  --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' `
  --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' `
  --phase03-stop-snaps 'data\interim\p0\phase03_stop_snaps_baseline.geojson' `
  --phase03-merchant-snaps 'data\interim\p0\phase03_merchant_snaps_baseline.geojson' `
  --phase03-primary-slice 'data\interim\p0\phase03_halte_simpang_dukuh_vertical_slice.json' `
  --analysis-version 'p0-central-v1' --output-root data `
  --methodology 'docs\methodology\ROUTING_OUTPUT_SUMMARY.md' --overwrite

& '.\.venv-spatial\Scripts\python.exe' -m unittest tests.spatial.test_p0_reachability_precompute -v
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v
& '.\.venv-spatial\Scripts\python.exe' -m pip check

& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_phase04_static_qa.py `
  --transit 'data\processed\p0\transit_points_p0.geojson' `
  --stop-snaps 'data\processed\p0\stop_snaps_p0.geojson' `
  --nodes 'data\processed\p0\pedestrian_nodes.geojson' `
  --edges 'data\processed\p0\pedestrian_edges.geojson' `
  --isochrones 'data\processed\p0\stop_isochrones.geojson' `
  --output-dir 'data\interim\p0\phase04_isochrone_png' `
  --manifest 'data\interim\p0\phase04_isochrone_static_manifest.json'

# Same config/fingerprint rerun; pre/post Compare-Object showed no input or canonical-output differences.
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_reachability_precompute.py `
  --transit-points 'data\processed\p0\transit_points_p0.geojson' `
  --culinary-poi 'data\processed\p0\culinary_poi_p0.geojson' `
  --pedestrian-nodes 'data\processed\p0\pedestrian_nodes.geojson' `
  --pedestrian-edges 'data\processed\p0\pedestrian_edges.geojson' `
  --phase03-stop-snaps 'data\interim\p0\phase03_stop_snaps_baseline.geojson' `
  --phase03-merchant-snaps 'data\interim\p0\phase03_merchant_snaps_baseline.geojson' `
  --phase03-primary-slice 'data\interim\p0\phase03_halte_simpang_dukuh_vertical_slice.json' `
  --analysis-version 'p0-central-v1' --output-root data `
  --methodology 'docs\methodology\ROUTING_OUTPUT_SUMMARY.md' `
  --preserve-manual-review --overwrite
```

The post-render read-only audit reprojected GeoJSON isochrones to EPSG:32749, called `metric_nesting_excess_m2`, checked all nine 5/10 pairs, verified PNG signatures, and verified 9/9 PASS review records.

## 9. Test Results

| Check | Actual result |
| --- | --- |
| Focused Phase-04 suite | **PASS — 8 tests, 0 failures**. |
| Complete spatial suite | **PASS — 21 tests, 0 failures** in 130.825 s. |
| Dependency integrity | **PASS** — `No broken requirements found.` |
| Phase-03 regression | **PASS** — canonical precompute reproduced snap and primary-route values/statuses. |
| Deterministic rerun | **PASS** — upstream/canonical SHA-256 values byte-identical. |
| Metric nesting | **PASS** — maximum excess `3.1928807339384226e-07 m²`; maximum applicable tolerance `1.284663145332572e-04 m²`; all individual checks pass. |
| Visual QA | **PASS — 9/9**. |

## 10. Data Quality / Spatial Validation Results

### Upstream hashes

| Input | SHA-256 |
| --- | --- |
| `transit_points_p0.geojson` | `D15301D6230B26E93F4BDD46E9839D26E174244E6ACABCB674F1BC9956C9B06E` |
| `culinary_poi_p0.geojson` | `B472BB9F0E8C18A5A85FAB6783FBA2455FD5A8FECE9BAAE4B23ED42A6AD7A608` |
| `pedestrian_nodes.geojson` | `547A82AA6CD4B2012EE931D022948B12836236F685129EB745DB9359F417D7D3` |
| `pedestrian_edges.geojson` | `6A77F7722AE6F3EF4674405EAEF2E43019F6C90363063E52BEDF44F388636355` |

### Required nine-stop metrics

| stop_id | stop_name | routable | <=5 | <=10 | median <=10 min | unroutable | disconnected | snap_too_far | outlier/review flag |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `6a92b1273f59e23bb862c863` | Halte Kaliasin | 326 | 43 | 96 | 5.688674503 | 29 | 10 | 19 | none |
| `6a92b2233f59e23bb862c962` | Halte Embong Malang | 326 | 23 | 92 | 7.401364643 | 29 | 10 | 19 | none |
| `6a92c5e152d86e03b51db51f` | Bus Stop Siola | 326 | 15 | 59 | 7.681695899 | 29 | 10 | 19 | none |
| `6a92c6ad52d86e03b51db794` | Bus Stop Tunjungan | 326 | 18 | 85 | 7.021734186 | 29 | 10 | 19 | none |
| `6a92c77152d86e03b51db962` | Halte Simpang Dukuh | 326 | 26 | 94 | 6.627356032 | 29 | 10 | 19 | none; primary PASS |
| `6a92c82852d86e03b51dbb58` | Halte Pangsud | 326 | 4 | 64 | 7.910436686 | 29 | 10 | 19 | none |
| `6a942f5e52d86e03b51efa52` | Bus Stop Balai Kota A | 326 | 14 | 67 | 6.465638114 | 29 | 10 | 19 | none |
| `6a94304b52d86e03b51efc92` | Bus Stop Grand City | 326 | 17 | 65 | 7.881969495 | 29 | 10 | 19 | none |
| `6a94322752d86e03b51f0365` | Halte Pemuda RRI | 326 | 28 | 48 | 4.163122965 | 29 | 10 | 19 | Tukey low-median diagnostic; visual PASS |

The authoritative 5-in-10 calculation occurs in EPSG:32749. The former tiny EPSG:4326 round-trip difference is only a serialization diagnostic and is not compared to a metre-squared tolerance.

## 11. Deviations from Approved Plan

Browser/file-URL QA was blocked by the environment GPU sandbox; Computer Use also could not safely establish the current local URL. Static PNG inspection was used instead. It reads existing canonical outputs and changes neither analytical geometry, method fingerprint/version, graph, thresholds, speed, nor eligibility. It was used only for manual visual inspection.

The planned HTML and GeoJSON QA artifacts were produced and retained. Static PNG/manifest artifacts supplemented them with a browser-independent review surface. No analytical-model deviation occurred.

## 12. Known Limitations

- The graph is a road-derived walking proxy, not complete sidewalk, entrance, legal-access, or grade-separation truth.
- Nearest-node connectors are not entrance modelling.
- Nineteen merchants remain `snap_too_far`; ten accepted merchant snaps remain disconnected. Neither was repaired with an approximation.
- `paths.geojson` is intentionally absent as stated in Section 5.

## 13. Bugs / Follow-up

None known. This evidence correction found a unit mismatch in prior report wording, not an analytical geometry bug: implementation validation was already metric and is now explicitly reusable/tested. PHASE-05 must not begin without separate authorization.

## 14. Reproduction Commands

Run the commands in Section 8 in this order: hash preflight; canonical precompute; focused/full tests and `pip check`; static render; manual review; same-fingerprint rerun with `--preserve-manual-review`; metric-CRS audit. Preserve `p0-central-v1`, 30/50 m, 1.3 m/s, and fingerprint `A0AE32FCDC33656774E190C42F9BA9483E2684228F7FCDB54B16728D5177BFF0`.

## 15. Environment / Configuration Changes

None. No dependency, environment variable, browser/GPU setting, or runtime configuration changed. The static renderer uses the existing spatial environment and standard library only.

## 16. Security Notes

None. No credential, secret, external upload, database connection, API call, or third-party transmission was introduced; all work used local repository artifacts.

## 17. Evidence for Definition of Done

| DoD item | Evidence |
| --- | --- |
| 9 stops / 3,195 unique pairs | Canonical output counts: 9 x 355. |
| IDs/version preserved | Output metadata and byte-identical same-fingerprint rerun. |
| Phase-03 regression | Precompute requires matching snap and primary-route values/statuses. |
| Connector-inclusive, unrounded routing | Access invariant/formula and focused boundary coverage. |
| Non-routable semantics | 171 `snap_too_far`, 90 `disconnected`, 0 invalid rows have null route facts/flags. |
| Valid 5/10 web isochrones | 18 EPSG:4326 features with canonical `duration_min`. |
| Authoritative nesting | EPSG:32749 maximum `3.1928807339384226e-07 m²`, within per-stop tolerance. |
| Origin, island, bridge checks | Explicit connectors, component bridge count zero, and 9 PASS visual records. |
| Eligibility independent of polygon | Access flags derive from Dijkstra total time; isochrones are visual-only. |
| All visual QA complete | Review JSON contains 9 PASS, 0 REVIEW/FAIL, and a PNG path per stop. |
| Reproducible / immutable inputs | Pre/post SHA-256 comparisons had no differences. |
| Metrics / outliers | Nine-stop table above; Pemuda diagnostic retained and reviewed. |
| No later-phase scope | Database/API/UI sections are none; PHASE-05 not started. |

## 18. Readiness for Next Phase

PHASE-04 is complete and ready for a separate review of its offline source-of-truth outputs. PHASE-05 has not been started, implemented, or prepared beyond preserving ingestible files.
