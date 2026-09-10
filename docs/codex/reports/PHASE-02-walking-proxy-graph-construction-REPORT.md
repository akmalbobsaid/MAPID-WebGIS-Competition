# PHASE-02 Implementation Report

## 1. Status

**PASS.** PHASE-02 constructed and validated the deterministic P0 walking-network proxy graph. Re-verification for this report correction found no discrepancy in graph topology, highway filtering, CRS, walking speed, analysis version, IDs, or canonical outputs. This status does not assert stop snapping or stop routability.

## 2. Scope Implemented

- Validated the immutable road FeatureCollection and Phase-01 routing extent, processed graph geometry in EPSG:32749, and exported graph geometry in EPSG:4326.
- Applied the frozen walking allowlist, retained valid parallel edges in an undirected `networkx.MultiGraph`, segmented only consecutive coordinates, assigned deterministic node/edge/component IDs, and computed connected components.
- Recorded `cycleway` as the one observed non-allowlisted category and excluded it from the P0 graph without changing the frozen exclude list or `analysis_version`.
- Created the visual-only graph coverage diagnostic, methodology document, spatial tests, and documentation-only reconciliation of the canonical raw road location to `data/raw/network/`.

No snapping, nearest-node distance, snap threshold tuning, routing status, Dijkstra, reachability, isochrone, database, API, UI, MAPID, or AGUS work was performed.

## 3. Files Added

| Path | Purpose |
| --- | --- |
| `scripts/spatial/p0_walking_graph.py` | Deterministic offline graph construction CLI. |
| `tests/spatial/test_p0_walking_graph.py` | Filter, topology, component, rerun, immutability, and diagnostic coverage tests. |
| `data/processed/p0/pedestrian_nodes.geojson` | Canonical node output. |
| `data/processed/p0/pedestrian_edges.geojson` | Canonical edge output. |
| `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` | Reproducible visual QA overlay. |
| `data/interim/p0/pedestrian_graph_coverage_diagnostic.png` | Static review screenshot exported from the HTML diagnostic during this evidence correction; not a product or routing artifact. |
| `docs/methodology/WALKING_NETWORK_METHOD.md` | Source, filtering, topology, cost, determinism, and limitations method. |
| This report | Phase-02 implementation evidence. |

Git diff evidence cannot be supplied: `git` remains unavailable on `PATH`. Equivalent file-change evidence is the explicit added/modified lists in Sections 3 and 4; no Git status, history, or `git diff --stat` is claimed.

## 4. Files Modified

| Path | Change |
| --- | --- |
| `scripts/spatial/requirements.txt` | Added `networkx==3.6.1` for the offline undirected graph and component analysis. |
| `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` | Corrected the canonical raw-road location from `data/raw/roads/` to `data/raw/network/`. |
| `data/README.md` | Corrected the same raw-road location. |

The path reconciliation is documentation-only. The raw GeoJSON was not moved, rewritten, or modified; it did not alter the spatial model or require an analysis-version bump.

## 5. Data Outputs Generated

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `data/processed/p0/pedestrian_nodes.geojson` | 3,623,286 | `547A82AA6CD4B2012EE931D022948B12836236F685129EB745DB9359F417D7D3` |
| `data/processed/p0/pedestrian_edges.geojson` | 9,540,404 | `6A77F7722AE6F3EF4674405EAEF2E43019F6C90363063E52BEDF44F388636355` |
| `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` | 1,430,875 | `DB0CD49FA6A0093CFAE4D12242DC7DBBAC5AA33CB5647C248B2F869CFAAA2B1C` |
| `data/interim/p0/pedestrian_graph_coverage_diagnostic.png` | 919,991 | `43AF87884CB1DE234E1207554858305DE66058CD6FC07435E3B8614D5C0812F2` |

The PNG is static review evidence rendered from the unchanged HTML diagnostic. The canonical graph outputs remain the two GeoJSON files; the HTML remains the Phase-02 visual QA artifact.

## 6. Database Migrations Applied

None. No Supabase/PostGIS project, database connection, migration, table, index, seed, or SQL statement was created or executed in PHASE-02.

## 7. API / UI Changes

None. No Next.js route, API contract, frontend component, map layer, product UI, or frontend dependency was changed. The HTML diagnostic is an offline validation artifact, not application UI.

## 8. Tests Run

The following command was re-executed during this report/evidence correction from repository root:

```powershell
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests\spatial -p 'test_*.py' -v
```

It runs four Phase-01 tests and four Phase-02 tests. The Phase-02 canonical rerun test builds twice into a `TemporaryDirectory`, compares byte hashes for nodes, edges, and the HTML diagnostic, and checks all input hashes before/after. It does not overwrite canonical Phase-02 outputs.

The following dependency validation command was also re-executed:

```powershell
.\.venv-spatial\Scripts\python.exe -m pip check
```

## 9. Test Results

**PASS — 8 tests passed, 0 failed** in 72.874 seconds. `pip check` returned `No broken requirements found.`

Phase-02 coverage includes: shared-coordinate intersection versus geometric crossing; bridge/layer-like crossing separation; undirected/parallel/`oneway` metadata behavior; frozen exclusion and `cycleway` non-allowlist exclusion; zero-length handling; scoped clip-boundary provenance; canonical deterministic rerun; raw/input immutability; output schema; and nine-stop diagnostic markup. Phase-01 regression tests also passed.

## 10. Data Quality / Spatial Validation Results

### Inputs, CRS, and immutability

| Input | SHA-256 |
| --- | --- |
| `data/raw/network/Jaringan Jalan Surabaya.geojson` | `799EC7DFF6DAA091DF6BEB1817E1B655D3204C6E8B209E71B4989821740BA5D9` |
| `data/processed/p0/routing_processing_extent.geojson` | `0EE77086F93753A083250C3D8F03F8B51A303B1E7187E7C0F72E741EF7161D7D` |
| `data/processed/p0/study_area_p0.geojson` | `AFE58FABF18AB869065E6AC1E5A1EEA3F23326221EF68220A9556C35CC443C32` |
| `data/processed/p0/transit_points_p0.geojson` | `D15301D6230B26E93F4BDD46E9839D26E174244E6ACABCB674F1BC9956C9B06E` |

The raw road source declares CRS84 and is processed as EPSG:4326 longitude/latitude with `always_xy=True`; metric operations are EPSG:32749. The pipeline hashes all inputs before and after writing. Re-verification confirms the raw road hash remains unchanged.

### Processing and graph metrics

| Metric | Result |
| --- | ---: |
| Raw road features | 55,707 |
| Invalid geometry encountered / dropped or repaired | 0 / 0 |
| Features after clip / before filter | 3,775 / 3,775 |
| Clipped LineString parts before filter | 3,778 |
| Features after highway filter | 3,680 |
| Generated graph nodes / edges | 13,616 / 14,818 |
| Zero-length edges dropped | 0 |
| Connected components | 73 |
| Largest component nodes | 12,947 |
| Largest component percentage | 95.0867% |
| Co-located clip-boundary coordinates represented by distinct node IDs | 0 |
| Analysis version | `p0-central-v1` |
| Walking speed | 1.3 m/s |

Every exported edge has positive `length_m` and `cost_seconds`; the cost formula is `length_m / 1.3`. All source/target IDs resolve to exported nodes. Graph outputs use deterministic full-SHA-256 node and edge IDs, are sorted deterministically, and are an undirected `MultiGraph`; vehicle `oneway` does not direct walking traversal.

### Highway inventory and decision

Post-clip feature inventory: included `footway` 177, `living_street` 891, `path` 17, `pedestrian` 2, `primary` 203, `primary_link` 29, `residential` 547, `secondary` 140, `secondary_link` 19, `service` 1,401, `steps` 23, `tertiary` 196, `tertiary_link` 20, and `unclassified` 15. Frozen-excluded observed classes were `trunk` 76 and `trunk_link` 18. `cycleway` was observed once and recorded as non-allowlisted/excluded.

No banned or non-allowlisted highway class remains in the 14,818 exported graph edges. Future `cycleway` inclusion remains an analytical deviation requiring review and version consideration.

### Visual validation

The visual QA artifact is exactly `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` with SHA-256 `DB0CD49FA6A0093CFAE4D12242DC7DBBAC5AA33CB5647C248B2F869CFAAA2B1C`. Its static screenshot export is `data/interim/p0/pedestrian_graph_coverage_diagnostic.png`.

Visual inspection of the overlay confirmed graph coverage across the primary P0 study area, visible network presence around all nine canonical transit markers, and no obvious missing corridor or visibly isolated marker. This is visual topology/coverage evidence only. It does not measure proximity, assign a routing status, prove snapping success, or establish routability.

## 11. Deviations from Approved Plan

No CRS, study-area, routing extent, walking speed, highway allowlist, graph topology, deterministic-ID, or output-contract deviation was found.

The pre-existing `data/raw/roads/` versus actual `data/raw/network/` discrepancy was reconciled in `P0_TECHNICAL_FREEZE.md` and `data/README.md` as planned. This was a documentation-location correction only; raw content/hash, graph model, and `analysis_version` did not change.

## 12. Known Limitations

- The result is a road-derived walking network proxy, not a complete pedestrian network.
- The source does not provide complete pedestrian `foot`/`access` evidence, which is why `cycleway` is not included. It also has no cost model for surface, smoothness, width, bridge, tunnel, or layer.
- The 95.0867% largest component meets the Phase-02 baseline but does not prove all stops are routable; snapping and route validation are explicitly deferred to Phase-03.
- Git executable remains unavailable on `PATH`, so Git status/history/diff evidence cannot be reported.

## 13. Bugs / Follow-up

No known Phase-02 implementation bug was found by re-verification.

Follow-up is intentionally constrained: Phase-03 may validate canonical-stop snapping and a routing vertical slice only after separate approval. Do not repair disconnected areas through proximity, buffers, blind noding, or `unary_union`; any topology/filter/speed/study-area change requires review. Future inclusion of `cycleway` requires an analytical deviation review and version consideration.

## 14. Reproduction Commands

The following commands were actually executed during implementation and/or this evidence correction from repository root.

```powershell
# Dependency update performed during implementation (NetworkX was newly installed).
& '.\.venv-spatial\Scripts\python.exe' -m pip install -r scripts\spatial\requirements.txt
& '.\.venv-spatial\Scripts\python.exe' -m pip check

# Input/hash preflight and later hash verification used these exact inputs.
$items = @('data\raw\network\Jaringan Jalan Surabaya.geojson','data\processed\p0\routing_processing_extent.geojson','data\processed\p0\study_area_p0.geojson','data\processed\p0\transit_points_p0.geojson','data\processed\p0\pedestrian_nodes.geojson','data\processed\p0\pedestrian_edges.geojson','data\interim\p0\pedestrian_graph_coverage_diagnostic.html')
Get-FileHash -Algorithm SHA256 $items

# Canonical graph build executed during implementation.
& '.\.venv-spatial\Scripts\python.exe' scripts\spatial\p0_walking_graph.py --roads 'data\raw\network\Jaringan Jalan Surabaya.geojson' --routing-extent 'data\processed\p0\routing_processing_extent.geojson' --study-area 'data\processed\p0\study_area_p0.geojson' --transit-points 'data\processed\p0\transit_points_p0.geojson' --coverage-diagnostic 'data\interim\p0\pedestrian_graph_coverage_diagnostic.html' --analysis-version p0-central-v1 --output-root data --overwrite

# Tests and deterministic rerun evidence; the canonical rerun is inside the test suite.
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v
& '.\.venv-spatial\Scripts\python.exe' -m pip check
```

The installed local Chrome executable was also run headlessly during this report correction to render the existing HTML diagnostic as `data/interim/p0/pedestrian_graph_coverage_diagnostic.png`. No separate command reran the production graph solely to compare output hashes: byte-identical rerun evidence comes from `test_canonical_pipeline_is_deterministic_and_preserves_inputs`, which ran twice in a temporary directory.

## 15. Environment / Configuration Changes

- Repository-local `.venv-spatial` now includes pinned `networkx==3.6.1` alongside GeoPandas 1.1.4, Shapely 2.1.2, and pyproj 3.8.0.
- No `.env` value, web runtime setting, JavaScript dependency, database configuration, deployment configuration, or frontend configuration changed.
- `P0_TECHNICAL_FREEZE.md` and `data/README.md` now consistently identify `data/raw/network/` as the canonical road location.

## 16. Security Notes

No credential, API key, secret, cloud connection, external data upload, database connection, or user-data transmission was introduced. Raw source data remains immutable and its SHA-256 was verified. The static PNG was rendered locally from the existing local HTML diagnostic only.

## 17. Evidence for Definition of Done

| PHASE-02 acceptance requirement | Concrete evidence |
| --- | --- |
| Graph successfully constructed | Canonical outputs exist: 13,616 nodes and 14,818 edges; hashes in Section 5. |
| Deterministic node/edge IDs and output | Full SHA-256 canonical IDs, explicit ordering, and byte-identical double temporary rerun in passing test `test_canonical_pipeline_is_deterministic_and_preserves_inputs`. |
| Positive edge length/cost | Output re-verification found 0 invalid/non-positive edges; pipeline validates `cost_seconds = length_m / 1.3`. |
| No banned/non-allowlisted output highway | Re-verification found 0 non-allowlisted graph edges; inventory and treatment are in Section 10. |
| Connected components available | 73 components; largest contains 12,947 nodes / 95.0867%, meeting the 95% baseline. |
| Raw-data immutability | Before/after pipeline hash guard, rerun test, and current raw SHA-256 `799EC7...1740BA5D9`. |
| Actual highway inventory/filter decision | Post-clip inventory is recorded in Section 10; `cycleway = 1` is explicitly observed non-allowlisted/excluded. |
| Methodology exists | `docs/methodology/WALKING_NETWORK_METHOD.md` documents walking proxy scope, CRS, filter, topology, cost, IDs, and limits. |
| Visual coverage artifact exists | HTML artifact exact path/hash and static PNG screenshot are in Sections 5 and 10. |
| Primary P0 study area visually covered | Visual overlay inspection records continuous graph coverage across the purple study-area boundary. |
| Visible network around all 9 canonical stops | All nine red markers are present in the overlay with visible nearby network context; this is not interpreted as snap or routability evidence. |
| No PHASE-03 snapping/routing work | Scope, code, output schemas, and visual diagnostic contain no nearest-node, snap, routing status, Dijkstra, or reachability result. |

## 18. Readiness for Next Phase

PHASE-02 is complete and passes its construction, deterministic-output, component, and visual-coverage gates. There is no current PHASE-02 blocker.

The next possible work is PHASE-03 stop snapping and routing vertical-slice validation, but it requires separate approval. Phase-02 does not authorize that work and does not claim that any of the nine stops is already snapped or routable.
