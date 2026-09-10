# PHASE-02 Plan

## 1. Goal

Membangun, setelah approval implementasi terpisah, graph **walking network proxy** P0 yang deterministic dan reproducible dari road source aktual ke node/edge GeoJSON. Pipeline akan memakai `routing_processing_extent` Phase-01, memproses geometri secara metrik di EPSG:32749, lalu menulis geometry output yang web-compatible di EPSG:4326. Kontrak analitis tetap `analysis_version = "p0-central-v1"`, kecepatan jalan kaki 1.3 m/s, graph tidak berarah, dan koneksi hanya berasal dari koordinat sumber yang benar-benar sama (bukan kedekatan atau crossing geometris).

Planning pass ini tidak mengimplementasikan pipeline atau menghasilkan graph.

## 2. In Scope

- Validasi source road immutable dan `routing_processing_extent` Phase-01 sebelum pemrosesan.
- Reproject road dari CRS84/EPSG:4326 ke EPSG:32749, clip terhadap routing extent, inventory `highway`, filter walking-proxy, explode, segmentasi koordinat berurutan, graph `MultiGraph` tidak berarah, dan connected components.
- ID node/edge deterministic, lineage, validasi graph, output node/edge GeoJSON, diagnostic overlay visual cakupan, test Python `unittest`, methodology, dan implementation report Phase-02.
- Diagnostik topology yang secara eksplisit membedakan shared source coordinate dari crossing tanpa shared coordinate.

## 3. Explicitly Out of Scope

Tidak ada stop/merchant snapping, tuning snap threshold, Dijkstra/reachability, isochrone, route merchant, PostGIS/migration, API, frontend, MAPID, AGUS, Access Quality, fitur P1, Euclidean-radius accessibility, atau routing HTTP dinamis. Phase-02 hanya membuat graph offline; Phase-03 baru memvalidasi snapping dan vertical-slice routing.

## 4. Current Repository Findings

- Root saat ini berisi aplikasi Next.js di `apps/web`, data, docs, `scripts/spatial`, dan `tests/spatial`. Tidak ada alasan untuk restructure repository.
- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` adalah state engineering utama: Python 3.13, raw/web EPSG:4326, metric EPSG:32749, kecepatan 1.3 m/s, offline/precomputed graph + Dijkstra, `p0-central-v1`, dan extent P0 yang dibekukan.
- Phase-01 telah **PASS** menurut `docs/codex/reports/PHASE-01-canonical-data-ingestion-study-area-REPORT.md`. Output tersedia dan konsisten secara struktur: `routing_processing_extent.geojson` satu polygon valid, metadata `output_crs = EPSG:4326`, dan properti `analysis_version = p0-central-v1`, `metric_crs = EPSG:32749`, serta `additional_buffer_m = 300`.
- Spatial stack yang benar-benar tersedia di `.venv-spatial` adalah GeoPandas 1.1.4, Shapely 2.1.2, dan pyproj 3.8.0; script Phase-01 menggunakan JSON standard library + Shapely/pyproj secara langsung. `networkx` belum terinstal dan belum tercantum di `scripts/spatial/requirements.txt`, walaupun version 3.6.1 telah diverifikasi pada P0 sebagai dependency graph/Dijkstra yang kompatibel.
- Test infrastructure yang ada adalah standard-library `unittest` di `tests/spatial/test_p0_ingestion.py`; tidak ada framework kedua yang perlu dibuat.
- Script Phase-01 `scripts/spatial/p0_ingestion.py` menyediakan convention yang dapat dipakai kembali: `ValidationError`, `sha256_file`, transform `to_metric`/`to_web`, output GeoJSON sorted/atomic, validasi path raw immutable, CLI `argparse`, dan rerun deterministic ke temporary directory.
- `.gitignore` sengaja tidak mengabaikan seluruh `data/interim`/`data/processed`; hanya cache, partial, backup, dan GeoPackage sidecar yang diabaikan. Output Phase-02 kecil/terinspeksi akan tetap reviewable. Runtime web tetap npm/Next 16.3.4/Node 24.x dan tidak disentuh.
- Git metadata directory ada, tetapi executable `git` tidak tersedia pada `PATH`; `git status` dan riwayat tidak dapat diperiksa pada planning pass ini. Tidak ada perubahan worktree yang boleh dihapus atau ditimpa berdasarkan keterbatasan tersebut.
- Lokasi raw road canonical yang akan dipakai adalah `data/raw/network/Jaringan Jalan Surabaya.geojson`; file aktual dan `.gitignore` sudah konsisten pada `network`. P0 freeze dan `data/README.md` masih menyebut `roads`, sehingga implementation Phase-02 akan merekonsiliasi **dokumentasi lokasi saja** ke path canonical aktual, tanpa memindah/menulis raw GeoJSON, mengubah model spasial, atau membump `analysis_version`.

## 5. Source Files / Data Inputs

| Input | Kondisi terinspeksi | Rencana validasi implementation |
| --- | --- | --- |
| `data/raw/network/Jaringan Jalan Surabaya.geojson` | Ada, 26,127,034 bytes, SHA-256 `799ec7dff6daa091df6beb1817e1b655d3204c6e8b209e71b4989821740ba5d9`; FeatureCollection dengan 55,707 MultiLineString, semua valid/non-empty pada diagnostik read-only. Legacy CRS adalah `urn:ogc:def:crs:OGC:1.3:CRS84`. | Require FeatureCollection; require legacy CRS84 atau explicit EPSG:4326 dengan axis longitude/latitude; validate feature/property/LineString-or-MultiLineString shape dan hash before/after. CRS lain atau CRS tak dapat ditentukan adalah BLOCKED. |
| `data/processed/p0/routing_processing_extent.geojson` | Ada, SHA-256 `0ee77086f93753a083250c3d8f03f8b51a303b1e7187e7c0f72e741ef7161d7d`; valid di EPSG:4326 dan setelah transform ke EPSG:32749. | Require satu Polygon/MultiPolygon valid, metadata/output CRS EPSG:4326, property `analysis_version = p0-central-v1`, `metric_crs = EPSG:32749`, dan `additional_buffer_m = 300`. Jangan regenerate atau expand extent. |
| `data/processed/p0/study_area_p0.geojson` | Output Phase-01 tersedia. | Validation-only: require satu geometry area valid dan `analysis_version = p0-central-v1`; tampilkan pada overlay coverage. Bukan input routing, snapping, atau batas pengganti extent. |
| `data/processed/p0/transit_points_p0.geojson` | Output Phase-01 tersedia dengan 9 titik canonical P0. | Validation-only: require tepat 9 Point dengan `analysis_version = p0-central-v1`; tampilkan seluruhnya pada overlay coverage. Jangan menghitung nearest node, `routing_status`, atau threshold snap. |

Road fields aktual adalah `bridge`, `highway`, `layer`, `name`, `oneway`, `osm_id`, `osm_type`, `smoothness`, `surface`, `tunnel`, dan `width`. `highway` tidak null/blank pada 55,707 fitur raw maupun 3,775 fitur yang menghasilkan line clip non-empty. Nilai `osm_id` adalah lineage source; ia tidak diasumsikan unik tanpa `source_feature_index`.

Diagnostik clip read-only memakai extent metric menemukan 3,775 feature dan 3,778 LineString part sebelum filter. Inventory **feature setelah clip** adalah berikut (bukan edge count):

| Treatment | Highway dan count |
| --- | --- |
| Frozen include | `footway` 177; `living_street` 891; `path` 17; `pedestrian` 2; `primary` 203; `primary_link` 29; `residential` 547; `secondary` 140; `secondary_link` 19; `service` 1,401; `steps` 23; `tertiary` 196; `tertiary_link` 20; `unclassified` 15. Total 3,680. |
| Frozen exclude observed | `trunk` 76; `trunk_link` 18. `motorway`, `motorway_link`, `raceway`, `construction`, dan `proposed` tidak muncul setelah clip, walaupun sebagian ada di source raw. |
| Observed non-allowlisted / excluded | `cycleway` 1. P0 tetap allowlist dari Master Guide; `cycleway` tidak masuk graph karena tidak ada dalam baseline include dan source tidak menyediakan evidence `foot`/`access` yang lengkap untuk membenarkan penambahannya. Ini dilaporkan sebagai `observed_non_allowlisted`/excluded, bukan ditambahkan retroaktif ke frozen baseline exclude list. Tidak ada analysis-version bump. Inklusi `cycleway` di masa depan adalah analytical deviation yang memerlukan review dan pertimbangan version. |

Kategori raw lain yang tidak jatuh ke extent (`corridor`, `track`) akan tetap dicatat bila muncul lagi setelah clip. Semua category baru yang belum dicakup keputusan approved ini harus melewati review gate dan tidak boleh di-include atau di-exclude secara diam-diam.

## 6. Assumptions

- CRS84 source ekuivalen dengan EPSG:4326 longitude/latitude untuk transform `always_xy=True`; ini harus diverifikasi dari metadata pada setiap run, bukan diinfer dari angka koordinat saja.
- Phase-01 extent yang ada adalah satu-satunya batas routing P0. Koreksi dokumentasi `roads` ke `network` adalah repository-location correction saja; raw road yang telah di-hash tetap immutable dan analysis version tidak berubah.
- Output GeoJSON akan memakai EPSG:4326 agar web-compatible dan mudah di-ingest ke PostGIS kemudian; `x_m`, `y_m`, `length_m`, dan `cost_seconds` tetap canonical metric values. GeoJSON metadata akan eksplisit menyatakan kedua CRS.
- Tidak ada penalty dari `surface`, `smoothness`, `width`, bridge, tunnel, layer, atau `oneway`; metadata relevan dipertahankan hanya untuk lineage/debugging.
- `study_area_p0` dan seluruh sembilan `transit_points_p0` adalah referensi visual acceptance saja. Mereka tidak mengubah extent, topology, node assignment, snapping, threshold, status routing, atau cost graph Phase-02.
- NetworkX 3.6.1 akan ditambahkan secara pinned pada implementation pass, sesuai bukti compatibility P0, untuk `nx.MultiGraph` dan connected components. Tidak ada dependency yang ditambah pada planning pass ini.

## 7. Proposed Changes

Implementation akan menambah script kecil `scripts/spatial/p0_walking_graph.py`, tanpa mengubah `p0_ingestion.py` secara fungsional. Script akan mengimpor/reuse helper Phase-01 yang stabil bila sesuai (`ValidationError`, CRS constants, hash, transform, safe atomic JSON write); graph-specific behavior tetap lokal agar ingestion tidak menjadi modul routing yang terlalu besar.

Fungsi utama yang direncanakan:

- `load_road_feature_collection()` dan `validate_road_source_contract()`;
- `load_and_validate_routing_extent()`;
- `inventory_highways()` dan `enforce_highway_review_gate()` (dengan keputusan approved `cycleway` sebagai non-allowlisted exclusion);
- `clip_to_routing_extent()`, `explode_clipped_lines()`, dan `segment_consecutive_coordinates()`;
- `source_coordinate_token()`, `clip_boundary_token()`, `node_id_for_token()`, dan `edge_id_for_segment()`;
- `build_pedestrian_multigraph()` dan `assign_deterministic_component_ids()`;
- `serialize_nodes()`, `serialize_edges()`, `render_coverage_diagnostic()`, `validate_graph_outputs()`, `run_pipeline()`, dan CLI `main()`.

`scripts/spatial/requirements.txt` akan ditambah hanya dengan `networkx==3.6.1`. `tests/spatial/test_p0_walking_graph.py` akan memperluas discovery `unittest` yang ada. Methodology dan Phase-02 report akan ditulis sebagai dokumentasi tersendiri, bukan generated output dari frontend. Implementation juga akan mengoreksi hanya referensi lokasi raw road pada P0 freeze dan data README, lalu mencatatnya sebagai koreksi dokumentasi repository, bukan perubahan spatial model.

## 8. Files to Create / Modify

| Path | Action setelah approval | Purpose |
| --- | --- | --- |
| `scripts/spatial/p0_walking_graph.py` | Create | CLI/pipeline graph deterministic; tidak ada server/API. |
| `scripts/spatial/requirements.txt` | Modify | Tambah `networkx==3.6.1`; pin spatial yang ada tidak diubah. |
| `tests/spatial/test_p0_walking_graph.py` | Create | Unit, topology synthetic fixture, deterministic rerun, dan integration validation. |
| `data/processed/p0/pedestrian_nodes.geojson` | Create generated output | Node EPSG:4326 dengan metric coordinates dan component ID. |
| `data/processed/p0/pedestrian_edges.geojson` | Create generated output | Edge EPSG:4326 dengan length/cost metric dan source metadata. |
| `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` | Create generated validation artifact | Overlay self-contained yang reproducible: graph edge, clipped-road context, `study_area_p0`, dan 9 transit points; untuk inspeksi visual coverage saja. |
| `docs/methodology/WALKING_NETWORK_METHOD.md` | Create | Method yang memakai actual inventory dan limitation walking-proxy. |
| `docs/codex/reports/PHASE-02-walking-proxy-graph-construction-REPORT.md` | Create setelah execution/validation | Record metrics, hashes, command/test result, exceptions, dan readiness Phase-03. |
| `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` | Modify | Koreksi referensi lokasi canonical raw road dari `data/raw/roads/` ke `data/raw/network/`, tanpa perubahan analytical contract atau version. |
| `data/README.md` | Modify | Koreksi referensi lokasi canonical raw road yang sama, tanpa memindah atau mengubah source data. |

Tidak ada raw file, output Phase-01, migration, file Next.js, database config, atau `.gitignore` yang direncanakan untuk diubah. SHA-256 road existing harus diverifikasi sebelum dan sesudah graph build/documentation correction.

## 9. Data / DB Schema Impact

Tidak ada database schema atau migration pada Phase-02. Dua GeoJSON canonical yang direncanakan dapat di-ingest ke PostGIS pada fase berikutnya karena geometry output EPSG:4326 dan ID text stabil, tetapi import itu bukan bagian phase ini.

`pedestrian_nodes.geojson` akan mempunyai FeatureCollection metadata `analysis_version`, `output_crs`, `metric_crs`, `walking_speed_mps`, hash/path source road dan extent, serta ordered feature properties:

```text
node_id TEXT
x_m DOUBLE PRECISION
y_m DOUBLE PRECISION
component_id TEXT
geometry POINT (EPSG:4326)
```

`pedestrian_edges.geojson` akan mempunyai metadata yang sama dan properties ordered:

```text
edge_id TEXT
source_node TEXT
target_node TEXT
osm_id TEXT/INTEGER NULL
highway TEXT NULL
surface TEXT NULL
bridge TEXT NULL
tunnel TEXT NULL
layer TEXT NULL
length_m DOUBLE PRECISION
cost_seconds DOUBLE PRECISION
source_feature_index INTEGER
part_index INTEGER
segment_index INTEGER
oneway TEXT/BOOLEAN/INTEGER NULL
geometry LINESTRING (EPSG:4326)
```

`source_feature_index`, `part_index`, dan `segment_index` preserve lineage/debugging. `oneway` boleh disimpan untuk audit tetapi tidak mempengaruhi edge direction. `name`, `osm_type`, `smoothness`, dan `width` tidak diperlukan dalam canonical graph schema/cost model dan tidak akan ditambahkan tanpa kebutuhan downstream yang disetujui.

## 10. Algorithms / Processing Details

1. Hash road dan seluruh input Phase-01 terlebih dahulu, load JSON dengan standard library, validasi schema/CRS, transform routing extent sekali ke EPSG:32749 dengan pyproj `always_xy=True`, dan fail loudly sebelum output bila contract tidak cocok. `study_area_p0` dan `transit_points_p0` hanya dibaca untuk diagnostic coverage setelah graph valid.
2. Validate setiap road geometry tanpa `make_valid`, `buffer(0)`, `unary_union`, snapping, atau repair topological lain. Raw diagnostics saat ini menunjukkan zero invalid geometry. Invalid/missing/non-line feature akan dicatat dengan index; jika berdampak pada extent P0 atau merupakan schema/material-quality issue, stop `BLOCKED` untuk review, bukan memperbaikinya. Empty/outside clip boleh dihitung sebagai drop alami.
3. Project valid road ke EPSG:32749 lalu intersect terhadap polygon routing extent. Hanya line components non-empty yang diteruskan; clip dapat memotong feature tetapi tidak melakukan noding antar-feature. Feature/part output clip diurutkan dengan source feature index, part index, dan canonical coordinate key sebelum serialization.
4. Inventory `highway` dijalankan **setelah clip dan sebelum filter**. Include set persis: `footway`, `pedestrian`, `path`, `steps`, `living_street`, `residential`, `service`, `unclassified`, `tertiary`, `tertiary_link`, `secondary`, `secondary_link`, `primary`, `primary_link`. Exclude set frozen persis: `motorway`, `motorway_link`, `trunk`, `trunk_link`, `raceway`, `construction`, `proposed`. `cycleway` yang telah diobservasi ditandai/di-report sebagai `observed_non_allowlisted` dan dikecualikan karena bukan allowlist; ia bukan tambahan pada frozen exclude set dan tidak menghambat build. Null, blank, malformed, atau category **baru** lain tetap bukan include otomatis dan harus block untuk review bila observed.
5. Explode clipped MultiLineString/GeometryCollection line components deterministically. Segment setiap LineString menjadi pasangan koordinat bertetangga saja; tidak ada simplification. Segment invalid atau dengan `length_m <= 0` akan dropped dan dihitung. Hitung `length_m` pada geometry metric, lalu `cost_seconds = length_m / 1.3`; keduanya harus finite dan positive.
6. Topology baseline adalah shared **source** coordinate. Original source coordinate yang sama pada beberapa road feature selalu resolve ke graph node yang sama. Untuk original vertices, key node memakai token exact `(longitude, latitude)` yang dinormalisasi dengan binary-float canonical representation (`float.hex`, dengan signed zero dinormalisasi) sehingga tidak ada tolerance/rounding/proximity merge. Ordinary geometric crossing tanpa shared source vertex tetap disconnected. Clipping terhadap `routing_processing_extent` juga tidak boleh menemukan pedestrian intersection baru: vertex baru akibat batas clip diberi scoped boundary token yang memuat source feature/part/clip-part/vertex provenance; titik sama pada dua source feature tidak otomatis dihubungkan hanya karena operasi clip membuat koordinatnya sama. Scoped boundary identity hanya safeguard terhadap artificial connection dari clipping, bukan model restriction pedestrian baru.
7. `node_id` adalah `node_` plus SHA-256 penuh dari canonical token/version. `x_m` dan `y_m` adalah hasil transform metric untuk token tersebut dan harus konsisten jika token source dipakai lebih dari sekali. Tidak ada UUID random. Sebelum ID final, registry memverifikasi token tidak memetakan ke metric coordinate yang berbeda; collision hash atau inconsistency adalah hard failure.
8. Untuk segment, canonical undirected endpoint pair adalah `min(node_id), max(node_id)`. `edge_id` adalah `edge_` plus SHA-256 penuh dari canonical JSON string berisi version, raw-road SHA-256, `osm_id`, `source_feature_index`, `part_index`, `segment_index`, dan endpoint pair terurut. Source/target fields selalu lexical ascending; geometry metric/web dibalik apabila perlu agar orientasinya sama dengan source-to-target canonical order. Dengan demikian pembalikan orientasi line source tidak mengubah semantics graph.
9. Segmen paralel valid dipertahankan dalam `nx.MultiGraph`: edge lineage berbeda menghasilkan ID berbeda meskipun endpoint sama. Duplikasi record yang berasal dari source feature berbeda juga dipertahankan dan dilaporkan sebagai diagnostic candidate, bukan dideduplicate diam-diam; duplikasi ID atau duplicate yang muncul dua kali dari satu source segment adalah builder error dan gagal.
10. Buat `networkx.MultiGraph`, tambahkan seluruh node/edge tanpa memakai `oneway`, lalu hitung `connected_components`. Sort component berdasarkan minimum `node_id` dan label stable `cc_000001`, `cc_000002`, dst.; sort node by `node_id` dan edge by `(source_node, target_node, edge_id)`. Serialize canonical FeatureCollections memakai `sort_keys=True`, newline LF, dan safe atomic writes. Hash ulang road dan semua input Phase-01 setelah write.
11. Geometry output dikonversi dari metric ke EPSG:4326 hanya saat serialization. Cost tidak dihitung ulang dari output web geometry. Metadata output dan report merekam count raw, clip, filter, node, edge, component, largest component, full inventory/filter decisions, geometry/zero-length drops, **count co-located coordinate yang direpresentasikan distinct node ID karena clip-boundary provenance**, CRS, analysis version, source hashes, dan path outputs. Tidak perlu summary artifact ketiga: `run_pipeline()` akan return/print JSON diagnostics deterministik dan report menyimpannya sebagai evidence.
12. Sesudah graph lulus validasi, `render_coverage_diagnostic()` akan menghasilkan `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` self-contained dan deterministic. Overlay SVG/local-coordinate ini memuat edge walking graph, semua clipped-road line sebagai context abu-abu, outline `study_area_p0`, seluruh 9 transit point beserta label/legend, CRS/version/hash, serta bounds yang sama; ia tidak membutuhkan map tile atau dependency frontend. Implementation report wajib mereferensikan artifact tersebut dan menjawab dari inspeksi visual apakah graph menutup primary study area, terlihat hadir di sekitar seluruh 9 stop, dan tidak menunjukkan corridor putus/gap yang jelas sehingga Phase-03 tidak layak dimulai. Jika stop tampak isolated atau scoped boundary identity menyebabkan fragmentation mencurigakan, report `BLOCKED`/review; jangan menjalankan snapping, nearest-node calculation, routing status, Dijkstra, proximity repair, atau noding baru.

Tidak ada `unary_union`, buffer-based connection, Euclidean proximity, spatial join noding, atau automatic full-crossing noding. Crossings bridge/tunnel/layer yang tidak mempunyai shared source coordinate tetap terpisah. Bridge, tunnel, dan layer hanya retained metadata; mereka tidak menjadi heuristic connectivity maupun cost.

## 11. API Contract Impact

Tidak ada perubahan API. Graph dibangun offline sebagai data artifact untuk pembaca Phase-03/04 mendatang; tidak ada route handler, dynamic routing endpoint, atau exposure ke client pada Phase-02.

## 12. UI Impact

Tidak ada perubahan UI. `apps/web` dan dependency frontend tidak disentuh; tidak ada map layer atau route visualisation pada Phase-02.

## 13. Tests and Validation

Gunakan `unittest` existing, `tempfile.TemporaryDirectory()`, dan fixture synthetic kecil. Test tidak menulis output production atau raw input.

- **Input/CRS:** require CRS84/EPSG:4326 source secara explicit, routing extent contract/validity, transform metric EPSG:32749, metadata output EPSG:4326, node Point/edge LineString valid.
- **Filter:** assert banned classes tidak ada pada edges; assert include exact; fixture `cycleway` yang observed non-allowlisted dikecualikan dan dilaporkan tanpa memblock build; null/blank/malformed atau category baru yang belum dicakup approved plan tetap fail/review-gate. Report akan memisahkan count clipped-feature inventory dari count segment/edge yang dihasilkan.
- **Edge/referential invariants:** every `length_m > 0`, `cost_seconds > 0`, finite, dan `isclose(cost_seconds, length_m / 1.3)`; `source_node != target_node`; seluruh endpoint edge ada pada node output.
- **Semantics:** `MultiGraph` undirected; fixture `oneway=yes` tetap dapat dilalui dua arah secara graph; all node have deterministic component ID; component count dan largest component metric repeatable.
- **Determinism/immutability:** pipeline yang sama dijalankan dua kali ke temporary root; compare node/edge bytes or SHA-256, IDs/counts/component metrics, dan raw road/extent hash before/after. Test juga memastikan sort order dan no random UUID.
- **Topology safety fixtures:** (a) shared-coordinate T intersection harus connected; (b) two lines crossing geometrically tanpa shared coordinate tidak connected; (c) bridge/underpass-like crossing dengan bridge/tunnel/layer metadata tidak connected; (d) sequential coordinates menghasilkan tepat satu edge per adjacent pair; (e) parallel/duplicate-source features survive as separate multiedges; (f) zero-length pair dropped; (g) shared clipped-boundary coordinate from unrelated source features is not promoted to a connection and increments the dedicated co-located/distinct-boundary-node diagnostic metric. Jika metric ini menunjukkan fragmentation mencurigakan atau bertentangan secara material dengan shared-source-coordinate model, test/integration harus stop for review, bukan mengubah topology.
- **Visual coverage acceptance:** validate input reference `study_area_p0` dan exactly 9 `transit_points_p0`; assert diagnostic HTML deterministically contains graph, clipped-road context, study-area, and all 9 labeled stop layers. Report wajib mereferensikan `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` dan mendokumentasikan hasil inspeksi: coverage visual primary study area, coverage terlihat sekitar seluruh stop, serta gap/fragment corridor yang jelas. Ini bukan test snap atau routing.
- **Integration:** run canonical source setelah inventory hanya berisi allowlist, frozen exclude, dan `cycleway` approved non-allowlisted treatment; assert output schemas, diagnostics minimum yang diminta, dan no final output is accepted if graph empty/invalid. Connectivity acceptance report computes components and largest-component percentage. `<95%` triggers diagnosis (isolated service roads, clipped fragments, scoped-boundary behavior, atau source topology) rather than automatic failure; Phase-02 must not claim all nine stops routable.

## 14. Commands Codex Plans to Run

Semua command berikut **direncanakan untuk implementation pass setelah approval**, bukan dijalankan pada planning pass ini. Jalankan dari root repository.

```powershell
# Confirm spatial environment and add the approved graph dependency.
.\.venv-spatial\Scripts\python.exe -m pip install -r scripts\spatial\requirements.txt
.\.venv-spatial\Scripts\python.exe -m pip check

# Read-only input/lineage and visual-reference preflight.
Get-FileHash -Algorithm SHA256 'data\raw\network\Jaringan Jalan Surabaya.geojson','data\processed\p0\routing_processing_extent.geojson','data\processed\p0\study_area_p0.geojson','data\processed\p0\transit_points_p0.geojson'

# Build canonical graph plus validation-only coverage diagnostic.
.\.venv-spatial\Scripts\python.exe scripts\spatial\p0_walking_graph.py --roads 'data\raw\network\Jaringan Jalan Surabaya.geojson' --routing-extent 'data\processed\p0\routing_processing_extent.geojson' --study-area 'data\processed\p0\study_area_p0.geojson' --transit-points 'data\processed\p0\transit_points_p0.geojson' --coverage-diagnostic 'data\interim\p0\pedestrian_graph_coverage_diagnostic.html' --analysis-version p0-central-v1 --output-root data --overwrite

# Execute existing and new spatial tests.
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests\spatial -p 'test_*.py' -v
```

CLI will have no switch that silently widens the frozen highway filter. `cycleway` is encoded as the already-approved observed non-allowlisted exclusion; any newly observed, undecided category must fail the review gate before the build is accepted.

## 15. Risks / Failure Modes

- Missing/changed road source, unprovable CRS, changed schema, unusable `highway`, invalid Phase-01 extent, absurd clip extent/result, or zero usable edges: fail `BLOCKED`; do not substitute data, regenerate extent, or use Euclidean proxy.
- `cycleway` is deliberately excluded/reported as the observed non-allowlisted category; future inclusion is an analytical deviation requiring review and version consideration. Any newly observed, undecided category after clip, unexpected null/malformed highway, material invalid geometry in P0, or source/output hash change requires review.
- Very low connectivity, suspicious P0 fragmentation, visual gap around a canonical stop, or a material count of co-located-but-distinct clip-boundary nodes requires component/topology diagnosis and review. A proposed remedy of blind noding, crossing union, proximity/buffer connection, changed study area, changed speed/filter, or analysis-version decision is a deviation requiring human review.
- Shapely clipping can split features and output order can vary if left implicit; use source lineage and explicit canonical ordering. Pinning Python dependencies, hash checks, canonical JSON, and tests reduce rerun drift.
- The raw file is about 26 MB/55.7k features. Full JSON load plus Shapely/NetworkX objects is acceptable for an offline P0 batch but implementation should process/filter promptly, avoid global unary union, log elapsed phases, and report unexpected memory/runtime pressure instead of adding an unreviewed spatial stack.

## 16. Rollback / Recovery

Raw data and Phase-01 artifacts are read-only inputs and never overwritten. New graph and coverage-diagnostic writes will use `.partial` sibling files plus atomic replacement only after validation; existing final graph files require explicit `--overwrite`. If validation/write fails, remove only generated partial files, retain prior valid outputs (if any), report `BLOCKED`, and reproduce from the immutable hashed inputs after the cause is resolved. A bad graph is recovered by deleting/replacing only its Phase-02 derived outputs after explicit authorization; no database, migration, or source rollback exists because none is changed. The documentation-location correction is reverted by restoring only its text if necessary; it never affects the raw file or graph model.

## 17. Open Questions

Tidak ada open question desain atau blocker input saat ini: `cycleway` telah diselesaikan sebagai observed non-allowlisted exclusion, dan canonical raw road path telah diselesaikan sebagai `data/raw/network/Jaringan Jalan Surabaya.geojson` dengan reconciliation dokumentasi terencana.

Keterbatasan evidence non-blocking tetap ada: executable Git tidak tersedia pada `PATH`, sehingga current worktree status tidak dapat diperiksa secara independen. Preserve seluruh file yang ada dan dapatkan Git tooling sebelum commit/review yang memerlukan status evidence.

## 18. Definition of Done

For the later implementation pass, completion requires:

- `cycleway` dikecualikan dan dilaporkan sebagai observed non-allowlisted category sesuai keputusan plan; setiap category baru yang belum disetujui tetap menghentikan review gate, dan future inclusion `cycleway` diperlakukan sebagai analytical deviation dengan version consideration;
- validated immutable source and Phase-01 extent, explicit CRS handling, and no change to P0 area/version/speed/topology contract;
- deterministic `pedestrian_nodes.geojson` and `pedestrian_edges.geojson` at the planned paths with schemas, lineage metadata, valid metric costs, positive segments, referential integrity, undirected graph semantics, and component IDs;
- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` dan `data/README.md` mereferensikan canonical raw road `data/raw/network/Jaringan Jalan Surabaya.geojson` secara konsisten, dengan SHA-256 raw terverifikasi before/after; report menyebutnya sebagai repository-location documentation correction tanpa spatial-model atau analysis-version change;
- report metrics: raw/clip/filter counts, node/edge/component counts, largest-component size/percentage, include/exclude inventory, invalid/repair/drop counts, zero-length count, co-located coordinate yang memakai distinct node ID karena clip-boundary provenance, CRS/version, hashes, dan output paths;
- no banned highway class and no silently included unknown class;
- rerun determinism plus raw immutability tests and all synthetic topology fixtures passing;
- `data/interim/p0/pedestrian_graph_coverage_diagnostic.html` tersedia, reproducible, dan direferensikan implementation report; report menjawab coverage visual primary study area, visible coverage di sekitar seluruh 9 canonical stop, serta ada/tidaknya corridor gap atau fragmentation yang membuat Phase-03 tidak layak. Tidak ada nearest-node distance, snap, `routing_status`, threshold tuning, atau Dijkstra pada diagnostic ini;
- `docs/methodology/WALKING_NETWORK_METHOD.md` accurately states that the result is a **walking network proxy yang dibangun dari jaringan jalan OSM melalui filtering kelas jalan**, not a complete pedestrian network; it documents extent, CRS, inventory/decisions, no crossing noding, bridge/tunnel/layer and `oneway` treatment, no surface/smoothness/width penalties, 1.3 m/s formula, IDs, components, and limitations;
- no Phase-03+ behavior, database/API/UI work, or raw-data modification.

For this planning pass, done means this repository-aware plan exists at the requested path, incorporates the actual source/schema/inventory findings, and no Phase-02 implementation artifact or code change has been made.
