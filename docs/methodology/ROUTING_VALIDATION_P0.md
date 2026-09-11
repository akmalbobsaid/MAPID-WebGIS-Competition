# P0 Routing Validation Method

## Scope and decision

This document records PHASE-03 validation evidence for deterministic nearest-node snapping and one Halte Simpang Dukuh vertical slice. It is an offline validation gate, not PHASE-04 precomputation. All PHASE-03 snap artifacts are labelled interim evidence under `data/interim/p0/`; no canonical `data/processed/p0/stop_snaps_p0.geojson` or `merchant_snaps_p0.geojson` was generated.

The tested baseline is retained and frozen for PHASE-03 review:

| Entity | Final PHASE-03 threshold | Analysis version |
| --- | ---: | --- |
| Canonical stop | 30 m | `p0-central-v1` |
| Canonical merchant | 50 m | `p0-central-v1` |

The data support retaining 30/50 m. No analytical change or version bump is proposed. PHASE-04 may generate its canonical processed snap outputs only after PHASE-03 receives `GO NEXT`.

## Inputs and preflight

The implementation loads, hashes before/after, and never rewrites these approved inputs:

- `data/processed/p0/transit_points_p0.geojson` — 9 canonical stops.
- `data/processed/p0/culinary_poi_p0.geojson` — 355 canonical merchants.
- `data/processed/p0/pedestrian_nodes.geojson` — 13,616 graph nodes.
- `data/processed/p0/pedestrian_edges.geojson` — 14,818 graph edges.

All GeoJSON geometry is EPSG:4326. Nearest-node distances, connector lengths, and graph costs are calculated in EPSG:32749 using an `always_xy` transform. Preflight verifies metadata/version, exact stop count and IDs, unique IDs, valid graph endpoints, node metric-coordinate agreement, positive finite edge lengths, `cost_seconds = length_m / 1.3`, an undirected MultiGraph contract, and loaded connected components. Input hashes are checked again after output writing.

## Snapping and status semantics

Each valid source Point is snapped to the metric nearest graph node, with ties sorted by `(distance_m, node_id)`. This is node snapping, not road-segment snapping. A valid feature always retains its nearest `node_id` and `snap_distance_m`, even if it fails the threshold. An invalid Point has null diagnostics.

Generic snap artifacts are origin-independent and use the Master routing vocabulary as follows:

| Status | PHASE-03 meaning |
| --- | --- |
| `routable` | Valid geometry has a nearest graph node at or below its applicable threshold. It is eligible for a per-stop route calculation. |
| `snap_too_far` | Valid geometry has a retained nearest-node/distance diagnostic but exceeds threshold and cannot enter routing. |
| `invalid_geometry` | The feature cannot be transformed/snapped; node/distance are null. |
| `disconnected` | A source-specific relationship status, not a merchant-wide snap fact. |

For the Simpang Dukuh vertical slice, `primary_route_status` is `routable` only when an accepted merchant node is in the primary component and has a NetworkX Dijkstra result. It is `disconnected` for an accepted node in another component. Thus a merchant can have generic `routing_status = routable` and `primary_route_status = disconnected`; it may still be reachable from another stop. PHASE-04 will materialize canonical statuses consistently per stop-merchant relationship.

## Routing and visual method

The implementation reconstructs the approved `networkx.MultiGraph`, inserting nodes and edges in sorted order and retaining parallel edges. It runs one `networkx.single_source_dijkstra` from the accepted Halte Simpang Dukuh node using `length_m`. For each path pair, visual reconstruction chooses the parallel edge with minimum length and then `edge_id`; the selected-edge sum must equal the NetworkX distance.

For a primary-routable merchant:

```text
total_distance_m = stop_snap_distance_m
                 + graph_shortest_path_distance_m
                 + merchant_snap_distance_m
walking_time_seconds = total_distance_m / 1.3
```

The 300/600-second bands are classified from unrounded seconds. Connector segments are visual diagnostics, not graph edges, but both connectors are included in total distance/time.

Selected cases are deterministic: lowest nonzero route, nearest to 300 seconds on either available side, nearest to 450 seconds in the 300–600 band, smallest route above 600 seconds, plus each observed non-routable relationship status. The interim GeoJSON and HTML include graph-network context, snapped nodes, connectors, and selected route geometry. The PNG is a static screenshot of that self-contained HTML, used for this manual review only.

## Baseline results

### Stops

All nine canonical stops are `routable`, in component `cc_000001`, and within the 30 m threshold. Their snap-distance distribution is: minimum 3.577 m, median 5.222 m, p90 11.595 m, p95 13.836 m, and maximum 16.077 m. The primary Halte Simpang Dukuh snap is 3.649 m to `node_aee75159a004ab3d0235e5470ce4b55133f56028799959aaf053455f420bb6c2` in `cc_000001`.

### Merchants

All 355 merchant geometries are valid. At the 50 m baseline, 336 are generically `routable` and 19 (5.35%) are `snap_too_far`; no merchant geometry is invalid. Valid-distance distribution: minimum 1.504 m, median 20.751 m, p90 44.995 m, p95 50.769 m, maximum 102.880 m; 216 are within 25 m.

Of the 336 accepted merchant snaps, 326 have `primary_route_status = routable` from Simpang Dukuh and 10 have `primary_route_status = disconnected`. The latter is relationship evidence only. The 19 threshold failures retain nearest-node diagnostics; the largest is SEA MONSTERS SEAFOOD RESTAURANT at 102.880 m. The selected threshold-failure case P.S.I PATISSERIE is 79.171 m, illustrating why a wider threshold should not be adopted merely to raise coverage.

## Manual spatial validation

I manually inspected the generated [interim overlay](../../data/interim/p0/phase03_halte_simpang_dukuh_validation.html) and its static [PNG review screenshot](../../data/interim/p0/phase03_halte_simpang_dukuh_validation.png). The context network, graph paths, and each connector were visually checked. No route jumped between disconnected graph pieces or showed an obvious impossible crossing in the available road-derived graph context. This is plausibility validation of the approved proxy graph, not evidence of pedestrian legal access, sidewalk quality, or grade-separation correctness beyond source topology.

| Deterministic selection | Merchant | Result | Review note |
| --- | --- | --- |
| Lowest nonzero route | IMHO COFFEE | PASS | 50.77 m total / 0.65 min; short connector-inclusive route is continuous in the local network context. |
| Nearest at-or-under 300 s | HOLLAND BAKERY | PASS | 378.82 m / 4.86 min; continuous path with short, visibly local connectors. No <=300 s candidate existed other than the near-zero case. |
| Nearest over 300 s | CHIR CHIR - TUNJUNGAN PLAZA 6 | PASS | 393.58 m / 5.05 min; route follows connected network geometry without a visible jump. |
| Nearest 450 s | KFC TUNJUNGAN PLAZA 3 | PASS | 581.84 m / 7.46 min; path is continuous in the retained graph context. |
| Smallest over 600 s | LAPIS LEGIT SPECIAL SUKA RASA | PASS | 781.28 m / 10.02 min; longer route remains graph-contiguous; no omitted connector. |
| `snap_too_far` status | P.S.I PATISSERIE | PASS | 79.17 m nearest-node diagnostic is retained and correctly excluded from Dijkstra. |
| `disconnected` relationship | COLORS PUB & RESTAURANT | PASS | Generic snap is threshold-valid; it is visibly separate from the primary component and is correctly not treated as a merchant-wide failure. |

## Limits and PHASE-04 handoff

The graph remains a filtered road-derived walking proxy. Nearest node is not necessarily the physically best entrance/path connection; no Euclidean routing fallback is used. The 10 Simpang Dukuh-disconnected relationships and 19 too-far merchant diagnostics must remain visible to PHASE-04 rather than being repaired in PHASE-03. No PHASE-02 topology, filtering, speed, CRS, source, or study-area decision was changed.

PHASE-03 has tested and frozen the final 30/50 m thresholds under `p0-central-v1`. Its evidence supports submission for `GO NEXT` review. On `GO NEXT`, PHASE-04 owns full precomputation and the two canonical processed snap outputs.
