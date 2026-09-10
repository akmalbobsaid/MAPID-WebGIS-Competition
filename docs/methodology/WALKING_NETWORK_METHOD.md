# Walking Network Method

## Scope and source

RUJAK P0 uses a **walking network proxy yang dibangun dari jaringan jalan OSM melalui filtering kelas jalan**, not a complete pedestrian network. The immutable source is `data/raw/network/Jaringan Jalan Surabaya.geojson`; its SHA-256 is recorded in each graph output. The repository path correction from the earlier `roads` wording is documentation-only and does not change the spatial model or `analysis_version`.

Processing is limited to the Phase-01 `routing_processing_extent`; `study_area_p0` and the nine canonical transit points are used only in a visual coverage diagnostic. They are not graph-snapping or routing inputs in Phase-02.

## CRS and costs

Raw and GeoJSON output geometry use EPSG:4326. All clipping, node construction, and length calculations use EPSG:32749. Each valid edge has:

```text
cost_seconds = length_m / 1.3
```

The graph is an undirected `MultiGraph`. Vehicle `oneway` metadata is retained for audit but does not constrain pedestrian traversal. Surface, smoothness, width, bridge, tunnel, and layer receive no cost penalty.

## Filtering and graph topology

The P0 allowlist is `footway`, `pedestrian`, `path`, `steps`, `living_street`, `residential`, `service`, `unclassified`, `tertiary`, `tertiary_link`, `secondary`, `secondary_link`, `primary`, and `primary_link`. Frozen excluded classes are `motorway`, `motorway_link`, `trunk`, `trunk_link`, `raceway`, `construction`, and `proposed`.

`cycleway` was observed after clip but is not in the allowlist. It is reported as `observed_non_allowlisted` and excluded because the source lacks complete `foot`/`access` evidence to justify inclusion. This does not amend the frozen exclude list or bump `p0-central-v1`; future inclusion requires analytical review and version consideration. Any newly observed undecided category stops for review.

Road features are validated, projected, clipped, exploded to LineString parts, and segmented only between consecutive coordinates. Original source coordinates shared by road features resolve to the same node. Ordinary geometric crossings without a shared source vertex remain disconnected. The pipeline never uses unary union, proximity, buffers, or automatic crossing noding.

Clipping can introduce a boundary coordinate. Such a coordinate has scoped provenance only to prevent clipping from inventing an intersection between unrelated roads; it is not a pedestrian restriction model. The implementation reports co-located coordinates represented by distinct node IDs due to this safeguard and requires review if it causes suspicious fragmentation.

## Determinism, components, and limitations

Node IDs are SHA-256 hashes of canonical exact source-coordinate or scoped-boundary tokens; edge IDs hash immutable road lineage, part/segment indices, and canonical unordered endpoint IDs. Features and components are explicitly sorted. Valid parallel edges are retained. Connected-component IDs are ordered by their minimum node ID.

`data/interim/p0/pedestrian_graph_coverage_diagnostic.html` is a reproducible visual overlay of graph edges, clipped-road context, the P0 study area, and all nine canonical stops. It helps assess obvious coverage gaps or fragmentation only. It does not calculate nearest-node distance, snap points, assign routing status, run Dijkstra, or prove that all stops are routable. Those tasks begin no earlier than Phase-03.
