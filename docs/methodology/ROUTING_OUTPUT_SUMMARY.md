# P0 Routing Output Summary

## PHASE-04 contract

Analysis version: `p0-central-v1`. Frozen snap thresholds: stop `30 m`, merchant `50 m`; walking speed `1.3 m/s`. Merchant eligibility is determined only from connector-inclusive Dijkstra time, unrounded at 300/600 seconds.

## Isochrone method

Method: `network_dijkstra_edge_intervals_buffer_v1`. For each undirected edge, the source and target reachable prefixes are unioned; two disjoint partial intervals are preserved. The physical stop connector is included in source linework and consumes its distance budget. `isochrone_buffer_m = 10` is a visual envelope only. Fingerprint: `A0AE32FCDC33656774E190C42F9BA9483E2684228F7FCDB54B16728D5177BFF0`.

## Per-stop metrics

| stop_id | routable merchants | <=5 min | <=10 min | median <=10-min walking time (min) | unroutable | review flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 6a92b1273f59e23bb862c863 | 326 | 43 | 96 | 5.6886745029804135 | 29 | none |
| 6a92b2233f59e23bb862c962 | 326 | 23 | 92 | 7.4013646426575495 | 29 | none |
| 6a92c5e152d86e03b51db51f | 326 | 15 | 59 | 7.681695899083943 | 29 | none |
| 6a92c6ad52d86e03b51db794 | 326 | 18 | 85 | 7.02173418638279 | 29 | none |
| 6a92c77152d86e03b51db962 | 326 | 26 | 94 | 6.62735603187176 | 29 | none |
| 6a92c82852d86e03b51dbb58 | 326 | 4 | 64 | 7.91043668558509 | 29 | none |
| 6a942f5e52d86e03b51efa52 | 326 | 14 | 67 | 6.465638113868312 | 29 | none |
| 6a94304b52d86e03b51efc92 | 326 | 17 | 65 | 7.881969494931277 | 29 | none |
| 6a94322752d86e03b51f0365 | 326 | 28 | 48 | 4.163122965425164 | 29 | tukey_1.5_iqr_median_reachable_10min_walking_time_min |

## Visual QA

Browser-based inspection of the local HTML was blocked by the environment GPU
sandbox and Computer Use local-URL policy. This did not change any analytical
output. The alternative static renderer
`scripts/spatial/p0_phase04_static_qa.py` reads the frozen outputs and emits
one PNG per stop under `data/interim/p0/phase04_isochrone_png/`, with the
walking proxy network, exact origin, connector, 5/10-minute outlines, label,
and a catchment-scale extent. It does not recalculate or alter routing,
snapping, thresholds, graph topology, `isochrone_buffer_m`, or geometry.

All nine PNGs were manually inspected. The completed evidence is
`data/interim/p0/phase04_isochrone_visual_review.json`: **9/9 PASS**. Each
record confirms visual 5-in-10 nesting, correct origin/connector depiction, no
obvious remote disconnected island, no misleading buffer bridge, and overall
spatial plausibility. The primary demo stop (Halte Simpang Dukuh) was reviewed
separately. Halte Pemuda RRI retains its Tukey metric flag as a reviewed
distribution diagnostic; its rendered isochrone geometry passed visual QA.
