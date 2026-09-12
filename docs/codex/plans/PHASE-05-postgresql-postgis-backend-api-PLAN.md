# PHASE-05 Plan

## 1. Goal

Implement, only after this plan is approved and the PHASE-04 dependency gate
is satisfied, the frozen data-serving chain:

```text
approved P0 GeoJSON/CSV -> Supabase PostgreSQL + PostGIS -> Next.js route handlers
```

The API will serve the approved, connector-inclusive PHASE-04 facts for
`p0-central-v1`. It will not load a graph, run Dijkstra, calculate an
isochrone, use Euclidean fallback, or decide merchant eligibility from a
polygon at request time.

## 2. In Scope

- A forward-only Supabase/PostGIS schema and reproducible, server-side P0
  importer for the approved canonical and PHASE-04 artifacts.
- The required tables: `transit_points`, `culinary_poi`, `stop_snaps`,
  `merchant_snaps`, `stop_merchant_access`, `stop_isochrones`, and
  `access_quality`.
- Server-only PostgreSQL access and Next.js App Router API route handlers for
  stops, merchant detail, isochrones, and discovery.
- Explicit active-analysis-version selection, validation, error responses,
  lightweight structured request logging, and database/API tests.
- Environment-template and deployment guidance for server-side database
  credentials.

## 3. Explicitly Out of Scope

- PHASE-06 UI, Leaflet/MAPID map work, AGUS, AI/LLM integration, accounts,
  authentication, RAG/vector data, background workers, microservices, or
  frontend recommendations.
- Changes to raw data, PHASE-01/02 canonical outputs, PHASE-03 evidence,
  PHASE-04 outputs, walking thresholds/speed, graph topology, or spatial
  processing scripts.
- Request-time routing, Dijkstra, isochrone regeneration, dynamic routing,
  current-location/multimodal routing, a 15-minute catchment, or a Euclidean
  fallback.
- Price, rating, opening-hours, menu, budget, or composite/best-restaurant
  ranking fields and filters.
- Loading `pedestrian_nodes` or `pedestrian_edges` into PostGIS for P0. The
  API has no graph query/use case; storing 13,616 nodes and 14,818 edges would
  duplicate offline-only routing inputs without supporting a required route.

## 4. Current Repository Findings

### Observed facts

- The frozen app is `apps/web`: Next.js `16.3.4`, React `19.2.8`, TypeScript,
  Node `24.x`, npm `>=11`, App Router, and only `dev`, `lint`, `build`, and
  `start` scripts. It remains the generated smoke-test page. There are no
  route handlers, server data modules, test runner, database dependency,
  Supabase directory, migration directory, database connection string, or
  deployment configuration in the repository.
- No `supabase`, `psql`, or Git executable is currently on `PATH`; Node and
  npm are available. `apps/web/node_modules` exists, but it must not be used
  as evidence that a direct database client is a declared dependency.
- `.env.example` contains only commented future placeholders. The documented
  local location is ignored `apps/web/.env.local`; deployed values belong in
  Vercel/Supabase settings. No credentials were found or inspected.
- The existing spatial test suite uses Python `unittest`. No JavaScript/API
  test tooling or database test environment exists.
- Every inspected processed GeoJSON collection carries metadata declaring
  `output_crs: EPSG:4326`; RFC 7946 GeoJSON has no legacy top-level `crs`
  member. Coordinates are longitude/latitude in the expected Surabaya range.
  PHASE-05 must verify the metadata and coordinate/geometry validity instead
  of inferring SRID from a filename.
- Current source artifacts and verified counts are:

  | Input | Observed format / count | PHASE-05 role |
  | --- | ---: | --- |
  | `data/processed/p0/transit_points_p0.geojson` | 9 Point features | canonical stops |
  | `data/processed/p0/culinary_poi_p0.geojson` | 355 Point features | canonical merchants |
  | `data/processed/p0/stop_snaps_p0.geojson` | 9 Point features | stop snap facts |
  | `data/processed/p0/merchant_snaps_p0.geojson` | 355 Point features | merchant snap facts |
  | `data/processed/p0/stop_merchant_access.geojson` | 3,195 records, all GeoJSON geometries `null` | precomputed discovery facts |
  | `data/processed/p0/stop_isochrones.geojson` | 18 Polygon features, durations 5 and 10 | map isochrones |
  | `data/interim/access_quality_p0_review.csv` | 9 rows, all `pending` | review/evidence seed |
  | `data/processed/p0/pedestrian_nodes.geojson` | 13,616 Point features | offline-only graph input; do not load |
  | `data/processed/p0/pedestrian_edges.geojson` | 14,818 LineString features | offline-only graph input; do not load |

- The current artifacts have only `analysis_version = p0-central-v1`.
  `stop_merchant_access` has 3,195 unique `(stop_id, merchant_id, version)`
  records, no missing canonical IDs, 188 reachable-5 rows, 670 reachable-10
  rows, and zero observed 5-not-in-10 violations. The primary demo stop
  `6a92c77152d86e03b51db962` has 355 access records, 26 reachable within 5
  minutes and 94 within 10 minutes.
- `paths.geojson` is absent intentionally. PHASE-04 reports that path
  geometries are optional and omitted; the current access file instead has
  null geometries and diagnostic `path_node_ids`. PHASE-05 will store a
  nullable `path_geometry` column as the contract allows, but will import null
  for this P0 version and will not manufacture paths.
- Canonical culinary categories presently contain one `category_l1` value
  (`MAKANAN DAN MINUMAN`), four `category_l2` values, and 29 `category_l3`
  values. Categories are source values, presently uppercase; no new taxonomy
  is required.
- The access-quality seed's suggested and approved structured columns are
  blank and every `review_status` is `pending`. Raw transit survey description
  is legitimate evidence; it is not an approved Access Quality fact.

### Inherited frozen/approved decisions

- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` freezes Supabase-managed
  PostgreSQL + PostGIS, Next.js route handlers in `apps/web`, Vercel serverless
  deployment, raw/API/web EPSG:4326, metric processing EPSG:32749, 1.3 m/s,
  5/10-minute P0 thresholds, and offline/precomputed Dijkstra.
- PHASE-01 defines canonical IDs: transit `stop_id` is Survey Activities `_id`;
  culinary `merchant_id` is the existing deterministic UUIDv5 emitted by the
  canonical pipeline. Neither is regenerated here. PHASE-01 documented 9
  stops, 355 P0 merchants, EPSG:4326 output, and the pending review seed.
- PHASE-02's graph is a road-derived walking proxy. PHASE-03 established
  30 m/50 m snaps and connector-inclusive route semantics. The exact
  `docs/codex/reports/PHASE-04-full-p0-reachability-precomputation-isochrones-REPORT.md`
  records **PASS** in Section 1; Section 9 records 8 focused/21 complete
  spatial tests passing, deterministic rerun, and metric nesting passing; and
  the current manual visual QA is **PASS — 9/9** (the review JSON has 9 PASS,
  0 REVIEW/FAIL). Its primary-stop row records Simpang Dukuh as primary PASS.
- The same PHASE-04 report explicitly says in Section 13 that PHASE-05 must
  not begin without separate authorization, and Section 18 says PHASE-04 is
  ready for a separate review. The required external ChatGPT review workflow
  subsequently granted **GO NEXT** after reviewing that final evidence. The
  Master Guide does not require a separate repository artifact for that review
  verdict. Thus the PHASE-04 dependency gate is satisfied; this plan does not
  change, regenerate, or compensate for PHASE-04 outputs.
- PHASE-04 reports `p0-central-v1`, 9 x 355 access pairs, 18 EPSG:4326
  isochrones, 90 disconnected and 171 `snap_too_far` access rows, no fallback,
  and the `network_dijkstra_edge_intervals_buffer_v1` isochrone method.

### Assumptions requiring validation

- This revision incorporates the Master Guide review corrections. The Master
  Guide is an external review source of truth and is not required to reside in
  this repository.
- A Supabase project with PostGIS and a Vercel deployment have not been
  provisioned. Separate runtime and administrative/test connection contracts,
  a dedicated test database, and the intended Supabase migration workflow are
  unavailable locally. This blocks live migration/import/API integration
  execution, not the planning artifact.

## 5. Source Files / Data Inputs

The importer will read, never modify, these approved inputs:

- `data/processed/p0/transit_points_p0.geojson`: map its existing fields to
  `transit_points`, preserving `_id`-derived `stop_id`, description, survey
  metadata, media JSON, source, validation status, scope, and EPSG:4326 Point.
- `data/processed/p0/culinary_poi_p0.geojson`: map its existing UUID
  `merchant_id`, name, three categories, contact/address/location/status/date
  values, provenance/status, and EPSG:4326 Point. `collected_at` and
  `updated_at` stay `TEXT`: current source forms such as `Q2 2026` and
  `09/04/2026` are not uniformly ISO dates.
- `data/processed/p0/stop_snaps_p0.geojson` and
  `data/processed/p0/merchant_snaps_p0.geojson`: map ID, `node_id`, snap
  distance, routing status, and analysis version. Source-only diagnostics may
  be retained only if needed for import verification; they are not API product
  fields.
- `data/processed/p0/stop_merchant_access.geojson`: map the required stored
  precompute fields exactly. `total_distance_m`, not `network_distance_m`, is
  the API walking distance. No eligible result is recalculated.
- `data/processed/p0/stop_isochrones.geojson`: map `stop_id`, `duration_min`,
  GeoJSON Polygon/MultiPolygon, method, and version. The current method is
  `network_dijkstra_edge_intervals_buffer_v1`.
- `data/interim/access_quality_p0_review.csv`: map `stop_id`, raw evidence,
  blank/null approved attributes, and `pending` review status. Suggested tags
  are not imported as approved values.

Before loading, the importer will read each FeatureCollection's metadata,
require `output_crs = EPSG:4326` where applicable, validate every required
ID/field/type/coordinate, validate valid nonempty Point/polygon geometry, and
compare ID sets and counts. It will require one consistent
`analysis_version` across the four analytical inputs; canonical GeoJSON
metadata may be checked as input provenance but is not mapped to canonical
database columns. It will reject rather than transform an input that claims a
different/unclear CRS. The database storage transformation is therefore
identity: GeoJSON longitude, latitude is parsed to PostGIS geometry SRID 4326;
metric distances/times remain stored numeric precomputed facts in
metres/seconds/minutes. EPSG:32749 remains the verified offline-analysis CRS
and is not used to reprocess data in the API.

## 6. Assumptions

- Active P0 selection is explicit and fail-closed: a server-only
  `RUJAK_ANALYSIS_VERSION` is required and initially set to `p0-central-v1`.
  It is not selected by newest timestamp, filename order, or an unqualified
  query. Every analytical join/filter uses the same parameter.
- Direct, server-only `pg` access is an approved implementation choice within
  the frozen Next.js route-handler backend. It remains compatible with
  Supabase-managed PostgreSQL/PostGIS when it uses the separate connection
  strategy below; it does not expose a browser database client, anon key, or
  direct browser database access.
- `DATABASE_URL_RUNTIME` is the Vercel/Next.js serverless runtime connection:
  the Supabase transaction-mode pooler URL for the least-privileged application
  role. The application-side `pg` pool is deliberately very small (normally
  one connection per warm instance), uses transactions/parameterized queries
  only, and does not depend on session settings, temporary tables, advisory
  locks, or named prepared statements.
- `DATABASE_URL_ADMIN` is a separately provisioned direct/session-capable
  administrative connection for migration and transactional imports.
  `DATABASE_URL_TEST_RUNTIME` and `DATABASE_URL_TEST_ADMIN` are corresponding
  credentials for the dedicated test database. Administrative/import work must
  never ambiguously reuse the Vercel runtime pooler URL.
- Versioned SQL migrations will use the standard `supabase/migrations/`
  directory and Supabase CLI workflow once the project is provisioned. The CLI
  is not presently installed; its pinned installation/configuration is a
  PHASE-05 implementation prerequisite, not an assumed existing command.
- Canonical P0 records are current canonical facts keyed by their frozen IDs.
  Analytical facts are versioned and may coexist by composite keys. A new
  analysis version must be loaded as a complete, internally consistent bundle;
  it cannot be mixed with another version in an API response.

## 7. Proposed Changes

### Database, migrations, and indexes

Create one initial forward-only SQL migration that first discovers the
installed `postgis` extension from `pg_extension`/`pg_namespace`. If it is not
enabled, the administrative provisioning step must enable it in the
project-agreed schema; if it is enabled in a different schema, migration stops
for review and never moves it silently. `RUJAK_POSTGIS_SCHEMA` is a non-secret
configuration value agreed with that installation; migration/import/runtime
preflight compare it with the catalog and fail on mismatch. PostGIS types and
functions are schema-qualified, or an explicitly validated search path is set
from that exact installation schema—never assumed to be `extensions`.

The migration creates a dedicated, non-Data-API-exposed application schema
`rujak` and places all seven tables there. Supabase Data API exposed schemas
must not include `rujak`. Migration/provisioning revokes `USAGE` on `rujak` and
all table/sequence/function privileges from `PUBLIC`, `anon`, and
`authenticated`; it grants only the minimum table privileges on `rujak` to the
server-side runtime role named by the runtime connection, while the separate
administrative owner performs migrations/imports. If project role provisioning
or exposure configuration cannot satisfy this, implementation stops rather than
falling back to `public` exposure.

| Table | Key columns and constraints | Geometry/index plan |
| --- | --- | --- |
| `rujak.transit_points` | `stop_id TEXT PRIMARY KEY`; `stop_name TEXT NOT NULL`; `description_raw TEXT`; `surveyed_at TIMESTAMPTZ NULL`; `surveyor TEXT NULL`; `media JSONB NULL`; `source TEXT NOT NULL`; `validation_status TEXT NOT NULL`; `scope TEXT NOT NULL`. Canonical and version-agnostic: no `analysis_version` column. | PostGIS `geometry(Point,4326) NOT NULL`, valid/nonempty check, GiST index. Primary key supplies stop lookup. |
| `rujak.culinary_poi` | `merchant_id UUID PRIMARY KEY`; name required; nullable category/contact/address/district/village/status/date fields; `source TEXT NOT NULL`; `validation_status TEXT NOT NULL`. Canonical and version-agnostic: no `analysis_version` column. Dates remain text as observed. | PostGIS `geometry(Point,4326) NOT NULL`, valid/nonempty check, GiST index. Primary key supplies merchant lookup. |
| `rujak.stop_snaps` | `stop_id TEXT NOT NULL REFERENCES rujak.transit_points(stop_id) ON DELETE RESTRICT ON UPDATE CASCADE`; `analysis_version TEXT NOT NULL`; `node_id TEXT NOT NULL`; nonnegative `snap_distance_m DOUBLE PRECISION`; `routing_status TEXT NOT NULL`; `PRIMARY KEY (stop_id, analysis_version)`. | No geometry column is required by the analytical/API contract: stop geometry is canonical and snap-node coordinates have no P0 API use. Composite PK serves stop/version lookups; add B-tree `(analysis_version)` only. |
| `rujak.merchant_snaps` | analogous FK to `rujak.culinary_poi`, nonnegative distance/status, `PRIMARY KEY (merchant_id, analysis_version)`. | No geometry column; composite PK and B-tree `(analysis_version)` only. |
| `rujak.stop_merchant_access` | FKs to canonical stop/merchant IDs with `RESTRICT` delete and `CASCADE` update; `PRIMARY KEY (stop_id, merchant_id, analysis_version)`; nullable `network_distance_m`, `total_distance_m`, seconds/minutes, flags, and `path_geometry`; nonnull routing status/version. | nullable schema-qualified PostGIS `path_geometry(LineString,4326)`, valid when present; GiST only if/when an implemented endpoint queries paths (none in P0). The primary key supplies the stop-leading identity path; add the required merchant-leading B-tree `CREATE INDEX ... ON rujak.stop_merchant_access (merchant_id, analysis_version)`. Retain discovery B-trees `(analysis_version, stop_id, reachable_5min, walking_time_seconds)` and `(analysis_version, stop_id, reachable_10min, walking_time_seconds)` only if implementation review confirms both query plans require them. |
| `rujak.stop_isochrones` | FK stop with `RESTRICT` delete/`CASCADE` update; `duration_min SMALLINT NOT NULL CHECK (duration_min IN (5,10))`; method/version required; `PRIMARY KEY (stop_id, duration_min, analysis_version)`. | schema-qualified PostGIS `geometry(Geometry,4326) NOT NULL`, valid/nonempty Polygon or MultiPolygon check; GiST index for map/spatial queries plus B-tree `(analysis_version)`; current source is Polygon but the contract permits MultiPolygon. |
| `rujak.access_quality` | `stop_id TEXT PRIMARY KEY REFERENCES rujak.transit_points(stop_id) ON DELETE RESTRICT ON UPDATE CASCADE`; source `evidence_text`; nullable approved shelter/seating/pedestrian/cleanliness/traffic fields; nonnull `review_status`; nullable reviewer. | No spatial column. The current pending CSV imports null approved fields. Do not create a taxonomy/check list beyond source-supported review state. |

For `stop_merchant_access`, version-agnostic database checks will require
nonnegative finite distances, `total_distance_m >= network_distance_m` for
routable records, internally consistent seconds/minutes, and
`reachable_5min => reachable_10min`. They will not hard-code 1.3 m/s: the
importer and P0 tests verify `walking_time_seconds ~= total_distance_m / 1.3`
for `p0-central-v1`, allowing a later approved analysis version to use its own
documented speed without a schema change.
Non-routable (`disconnected`/`snap_too_far`) P0 records must retain null route
metrics and null flags rather than fabricated zeros. The loader will validate
the source status vocabulary before insertion; no general product enum is
invented.

There is deliberately no graph schema. The canonical geometries and
isochrones receive GiST indexes because they are actual map/spatial data;
relational API access relies on primary/composite B-tree indexes. No redundant
single-column `stop_id`/`merchant_id` indexes are added where the primary key
already has that leading column.

### Import contract

Add one server-side Node importer using built-in JSON parsing, a pinned
general-purpose CSV parser that correctly handles quoted delimiters and
multiline survey evidence, and parameterized `pg` statements. It must not use
`split`, manual line parsing, or a pretend built-in Node CSV parser. The script
uses `DATABASE_URL_ADMIN`, never the runtime connection. It will:

1. Load all required artifacts into memory/staging structures, validate
   metadata/CRS/geometry/IDs/duplicates and the source relationships before a
   database mutation.
2. Require nine canonical stops; derive the merchant count from the canonical
   source (currently 355), require one snap per canonical entity, require
   `9 * merchant_count` unique access pairs (currently 3,195), and require
   exactly 5/10 isochrones for every stop (currently 18). Confirm the primary
   stop and its 26/94 P0 reachable counts are present as a regression check.
3. Open one administrative transaction. Canonical ID duplicates in source fail
   before SQL. Existing canonical rows are reused idempotently when their
   canonical fields and geometry match; an unchanged canonical entity is not
   “drift” merely because a new analytical version is being imported. A genuine
   conflicting canonical-source change fails loudly for separate canonical-data
   review rather than being silently updated.
4. Replace only rows of the requested analytical version in dependency-safe
   order, then insert the complete validated snap/access/isochrone bundle.
   This is a documented versioned replace, not broad `ON CONFLICT DO NOTHING`.
   A new analytical version coexists with previous versions against the same
   canonical entities; other versions are untouched. Any failure rolls back
   the whole transaction.
5. Insert/reconcile the pending access-quality seed without converting
   suggestions into approved data. Report per-table source/imported counts,
   version, source hashes/metadata, and mismatches; a nonzero discrepancy is a
   failure with a nonzero exit code.

The script never writes input artifacts and never connects from client code.

### Backend/API implementation

Add a server-only database/config module in `apps/web/src/lib/server/`:

- Build one server-only, module-level `pg` pool from `DATABASE_URL_RUNTIME`,
  prohibit importing it into client components, set an application name in the
  connection URL/configuration, use a very small pool, parameterized SQL and
  short transactions, and map only known database errors to public responses.
  It targets Supabase transaction-mode pooling and therefore uses neither
  named prepared statements nor any session-dependent behavior. Migrations and
  imports use `DATABASE_URL_ADMIN`, never this pool.
- Read and validate `RUJAK_ANALYSIS_VERSION` once; every analytical query
  receives that value. A stop's active snap and complete access/isochrone data
  must exist for that same version before the API reports analytical results.
- Serialize PostGIS geometry with the schema-qualified installed
  `ST_AsGeoJSON(geometry)::json`, preserving EPSG:4326 GeoJSON for the web.
  The PostGIS schema is catalog-validated against `RUJAK_POSTGIS_SCHEMA`; no
  API query transforms geometry to 32749.
- Use a small error helper with `{ error: { code, message, request_id,
  details? } }`; `details` contains only safe validation metadata. Add one
  concise structured log per request containing request ID, endpoint, stop ID
  when present, threshold/category, analysis version, result count/error code,
  and latency. Never log connection strings, request credentials, or media
  content.

Create these route handlers, following the installed Next.js 16 route-handler
guidance during implementation:

- `GET /api/stops`: return `{ stops: [{ stop_id, stop_name, geometry,
  source, validation_status, scope }] }`, ordered by `stop_name, stop_id`.
  Stops are canonical/version-agnostic and do not echo `analysis_version`. No
  claimed Access Quality attributes are added.
- `GET /api/stops/:stopId`: return the canonical stop, its EPSG:4326 geometry,
  legitimate survey evidence (`description_raw`, `surveyed_at`, `surveyor`,
  `media`), and `access_quality`. For a `pending` row, return its review status
  and `null` structured attributes; return structured values only for an
  explicitly approved source row. Stop detail is canonical and does not echo
  `analysis_version`.
- `GET /api/merchants/:merchantId`: return only source-backed canonical fields
  and EPSG:4326 geometry: ID, name, categories, phone, address, district,
  village, status, collected/updated text, source and validation status. Do
  not add price, rating, opening-hours, or menu fields.
- `GET /api/stops/:stopId/isochrones?minutes=5|10`: validate the fixed integer
  duration and return `{ stop_id, duration_min, geometry, method,
  analysis_version }`. It returns the stored isochrone; it never derives an
  eligibility set from the polygon.
- `POST /api/discovery`: accept exactly a JSON object with string `stop_id`,
  integer `max_walk_time` of 5 or 10, and `category` either null or a nonblank
  string. First resolve the canonical stop and its active snap. Query the
  active-version `stop_merchant_access` joined to `culinary_poi`, select only
  rows marked `reachable_5min` or `reachable_10min` for the requested band,
  sort `walking_time_seconds ASC, merchant_id ASC`, and expose
  `walking_distance_m = total_distance_m` subject only to documented display
  rounding. The response follows the supplied stop/criteria/results shape and
  includes `analysis_version`.

Category filtering is an OR match against existing `category_l1`,
`category_l2`, or `category_l3`; `null` adds no predicate. The handler trims,
collapses whitespace, and normalizes case before comparison; SQL compares the
same normalized values. This is a case-insensitive match to existing canonical
labels, not a new taxonomy. An unknown category is valid and produces the
normal HTTP 200 empty result set. The time predicate always remains the stored
5/10 boolean, so category filtering cannot break the equivalent 5-minute
subset-of-10-minute invariant.

### Error and integrity behavior

| Situation | Planned status / stable code |
| --- | --- |
| malformed body, invalid ID syntax, missing field, non-JSON body | `400 VALIDATION_ERROR` |
| canonical stop not found | `404 STOP_NOT_FOUND` |
| invalid UUID merchant ID / valid but missing merchant | `400 INVALID_MERCHANT_ID` / `404 MERCHANT_NOT_FOUND` |
| discovery `max_walk_time` or isochrone `minutes` not 5/10 | `422 UNSUPPORTED_WALK_THRESHOLD` / `422 UNSUPPORTED_ISOCHRONE_DURATION` |
| canonical stop exists but active stop snap is non-routable | `409 STOP_UNROUTABLE` |
| required active-version snap/access/isochrone data absent, partial, or mismatched | `503 ANALYSIS_DATA_UNAVAILABLE` |
| valid discovery/category combination has no matching merchants | `200` with `results: []` |
| unexpected database/runtime failure | `500 INTERNAL_ERROR` with request ID only |

The database readiness check distinguishes a legitimate empty discovery result
from missing analysis: for the active stop/version it verifies the complete
access cardinality against current canonical merchant count before querying the
threshold. This is a read-only integrity check, not routing.

## 8. Files to Create / Modify

Implementation is expected to create/modify only the following PHASE-05 files
(timestamp in the migration name will be generated at implementation time):

| Path | Planned change |
| --- | --- |
| `supabase/config.toml` | Supabase project/local-development configuration, after provisioning choice is confirmed. |
| `supabase/migrations/<timestamp>_phase05_postgis_schema.sql` | PostGIS enablement, tables, constraints, FKs, and indexes described above. |
| `scripts/database/import-p0.mjs` | Transactional source-artifact validator/importer using the administrative connection and robust pinned CSV parsing, with count summary. |
| `apps/web/package.json`, `apps/web/package-lock.json` | Add the minimal direct PostgreSQL client, robust pinned CSV parser, and selected API-test tooling/scripts; no browser DB client. |
| `.env.example` | Add blank/non-secret placeholders and comments for `DATABASE_URL_RUNTIME`, `DATABASE_URL_ADMIN`, `DATABASE_URL_TEST_RUNTIME`, `DATABASE_URL_TEST_ADMIN`, `RUJAK_ANALYSIS_VERSION`, and `RUJAK_POSTGIS_SCHEMA`; retain no credential value. |
| `apps/web/src/lib/server/rujak-db.ts` | Server-only pool, active-version configuration, parameterized query helpers, geometry serialization, and observability helpers. |
| `apps/web/src/lib/server/api-contract.ts` | Shared validation, response/error serialization, category normalization, and route-safe types. |
| `apps/web/src/app/api/stops/route.ts` | Stops list handler. |
| `apps/web/src/app/api/stops/[stopId]/route.ts` | Stop detail handler. |
| `apps/web/src/app/api/stops/[stopId]/isochrones/route.ts` | Stored isochrone handler. |
| `apps/web/src/app/api/merchants/[merchantId]/route.ts` | Merchant detail handler. |
| `apps/web/src/app/api/discovery/route.ts` | Precomputed discovery handler. |
| `apps/web/vitest.config.ts` and `apps/web/tests/api/*.test.ts` | Chosen API/database test configuration and route/data-integrity coverage. |

Exact package versions, Supabase project reference, separate runtime/admin
URLs, approved PostGIS installation schema, and migration timestamp cannot be
selected safely until implementation authorization/provisioning. No PHASE-05
source file is created in this planning-only pass other than this plan.

## 9. Data / DB Schema Impact

The database becomes a serving copy of version-agnostic canonical P0 entities
and approved versioned analytical facts. It does not become the source of truth
for raw data or spatial analysis. Database geometry is EPSG:4326 because the
actual canonical/analytical GeoJSON explicitly declares that output CRS;
geometry typemods and validity checks prevent accidental insertion of
EPSG:32749 meter coordinates as web coordinates. Precomputed metres/seconds/
minutes are stored as double precision and are not recomputed.

The canonical tables retain IDs as their version-agnostic identities and do not
store `analysis_version`. Analytical tables use version-aware composite primary
keys so a later approved version can coexist against unchanged canonical rows;
their FK IDs must resolve to canonical rows. The importer rejects one input
bundle that mixes analytical versions, has duplicate IDs, loses an expected
canonical ID, or does not satisfy its expected cardinalities. A later canonical
schema/data change that would break the frozen ID contract is a review blocker,
not an analytical-version upsert case.

`access_quality` preserves review evidence without claiming unreviewed facts.
The dedicated `rujak` schema is not a Supabase Data API surface and client
roles have no direct privileges; browser access remains only through the
server-side API. No raw-source field is overwritten and no unprovided
commercial/product field is introduced. The offline pedestrian graph remains
in its existing processed files because the P0 backend has neither a graph
query nor dynamic routing.

## 10. Algorithms / Processing Details

The only implementation-time processing is deterministic validation/import and
read-only SQL filtering:

1. Parse GeoJSON/CSV; require source metadata/version/CRS, valid geometry, and
   unique identifiers. Reconcile canonical sets with snaps/access/isochrones.
2. Parse EPSG:4326 GeoJSON directly into PostGIS SRID 4326. Do not call a
   coordinate transform unless a future approved source explicitly supplies a
   different, proven CRS; that condition fails this P0 importer instead.
3. Use an all-or-nothing transaction for the approved versioned analytical
   bundle. Preflight occurs before deleting/replacing its version rows, so
   malformed data cannot leave a partial replacement.
4. Discovery performs a relational join and stored boolean filter only. For
   five minutes it selects `reachable_5min IS TRUE`; for ten minutes it selects
   `reachable_10min IS TRUE`. It reads stored `total_distance_m` and
   `walking_time_*`, then sorts by stored seconds. It does not inspect
   isochrone geometry for eligibility.

This preserves `5-minute results subset of 10-minute results` for equal
stop/category criteria, assuming the imported approved source passes its
existing invariant. The API has no algorithm that could turn a disconnected or
too-far row into a candidate.

## 11. API Contract Impact

The project gains the five P0 API capabilities listed in Section 7. All output
geometries are GeoJSON values in EPSG:4326. Analytical isochrone/discovery
responses always echo the selected `analysis_version`; canonical stop/merchant
responses do not. Numeric discovery fields retain stored precision in
the server model; any display rounding is documented at the response boundary
and never changes filtering/sorting.

There is no authentication contract in P0. Database credentials remain only in
the route-handler runtime. The public contract contains no credentials, no
network graph, no path requirement, and no fields for price/rating/hours/menu
or recommendation score.

## 12. UI Impact

No UI or PHASE-06 work is included. The endpoints provide stable inputs for a
later frontend: stop and merchant GeoJSON, stored 5/10 isochrones, survey
evidence/review status, and discovery results in walking-time order. No page,
map, component, Leaflet dependency, or client-side database access is planned.

## 13. Tests and Validation

Implementation will add concrete database/import/API tests in addition to
retaining the existing spatial suite unchanged.

- Migration test on a clean dedicated test database through
  `DATABASE_URL_TEST_ADMIN`: PostGIS capability is present in the
  catalog-approved configured schema; no migration moves an existing extension;
  all required tables, geometry SRIDs/types, PKs, FKs, checks, and
  named/expected indexes exist; and migration rerun behavior follows the
  forward-only migration tool contract.
- Exposure/security test: `rujak` is absent from the configured Supabase Data
  API exposed-schema set; `PUBLIC`, `anon`, and `authenticated` lack schema,
  table, sequence, and function access; an actual test query under a client
  role is denied; and only the runtime role has the least privileges needed by
  the route SQL. These tests run through the administrative test connection and
  do not require or expose browser credentials.
- Import test through `DATABASE_URL_TEST_ADMIN`: first import succeeds; a
  same-input rerun is idempotent; a new valid analytical version coexists
  without changing canonical rows; quoted/multiline CSV evidence parses
  correctly; and a malformed required field, duplicate source canonical ID,
  mismatched analytical version, unclear CRS, invalid geometry, source/database
  count mismatch, or P0 speed-invariant failure fails and leaves prior committed
  rows intact.
- Imported data assertions: 9 unique canonical stop IDs; current canonical
  merchant count derived from the approved source (355 now); canonical tables
  have no `analysis_version` column; all analytical IDs resolve to canonical
  IDs; 9/355 snaps; 3,195 unique access pairs; 18 5/10 isochrones;
  `p0-central-v1` is preserved on every analytical table; all access-quality
  rows are pending with no approved fields; no stale alternate transit source;
  and no price/rating/hours/menu columns or response values.
- Analytical/database assertions: every access result has stored source values;
  `total_distance_m` is the discovery distance; serialized walking time agrees
  with stored value within documented rounding; 5-minute rows are a subset of
  equivalent 10-minute rows; category matching returns the correct canonical
  subset; and no API/import module imports NetworkX, graph files, or routing
  code.
- Runtime/API integration tests use `DATABASE_URL_TEST_RUNTIME`, configured as
  the transaction-mode pooled connection and exercised without session
  assumptions/named prepared statements. Administrative migration/import tests
  never use that runtime URL.
- Primary regression: `GET`/discovery for
  `6a92c77152d86e03b51db962` (`Halte Simpang Dukuh`) succeeds against the real
  test database, returns 26/94 stored five/ten-minute results before category
  filtering, and each response row matches `stop_merchant_access` exactly.
- API tests cover `GET /api/stops`, valid/unknown stop detail, valid/invalid
  merchant detail, stored 5/10 isochrones, unsupported duration, valid 5/10
  discovery, case/whitespace-normalized category filter, unknown-category zero
  result, malformed JSON/body, unsupported threshold, malformed/unknown IDs,
  unroutable stop fixture, missing/partial active analysis fixture, geometry
  serialization, and practical database-error mapping. The latter uses a
  controlled test stub/connection failure and must not expose a credential.
- Run existing Python `unittest` spatial tests as a regression signal only;
  PHASE-05 tests must not regenerate or alter their outputs. Run web lint,
  API tests, type/build checks, and a real test-database API smoke test after
  import.

## 14. Commands Codex Plans to Run

No command below is run in this planning pass. Existing discovered commands
are shown as-is; commands marked proposed require the files/tooling described
above to be created/provisioned during approved implementation.

```powershell
Write-Output 'Existing web checks'
npm --prefix apps/web run lint
npm --prefix apps/web run build

Write-Output 'Existing spatial regression (read/test only; no production preprocessing)'
& '.\.venv-spatial\Scripts\python.exe' -m unittest discover -s tests\spatial -p 'test_*.py' -v

Write-Output 'Proposed migration against DATABASE_URL_TEST_ADMIN after adding pinned Supabase CLI/config'
npm --prefix apps/web run db:migrate:test

Write-Output 'Proposed script: validates then transactionally imports approved artifacts with administrative test URL'
node scripts/database/import-p0.mjs --database-url $env:DATABASE_URL_TEST_ADMIN --analysis-version p0-central-v1

Write-Output 'Proposed API/database test script using DATABASE_URL_TEST_RUNTIME, then type/build validation'
npm --prefix apps/web run test:api
npm --prefix apps/web run build

Write-Output 'Proposed production migration/import using DATABASE_URL_ADMIN only after explicit production approval'
npm --prefix apps/web run db:migrate
node scripts/database/import-p0.mjs --database-url $env:DATABASE_URL_ADMIN --analysis-version $env:RUJAK_ANALYSIS_VERSION
```

The `db:*` and `test:api` scripts do not exist yet and will be declared in
`apps/web/package.json` as part of implementation. Before any live command,
the implementation must verify the Supabase project target, catalog-confirmed
PostGIS schema, runtime-vs-administrative/test connection purpose, and that no
command can target an unintended database.

## 15. Risks / Failure Modes

- **Unavailable Supabase/PostGIS credentials/project or CLI:** blocks real
  migration/import/API verification. Separate runtime pooled and
  administrative/test connections are required. Do not substitute a
  client-side database, local file API, alternate backend, or mock-only
  completion claim.
- **PostGIS installation/exposure mismatch:** abort if `postgis` is absent or
  installed in an unapproved schema, or if `rujak` would be exposed to the Data
  API/client roles. Never move the extension or grant public access silently.
- **CRS ambiguity or malformed geometry:** abort import. Do not guess SRID or
  transform unknown coordinates.
- **Missing, partial, duplicate, mismatched-version, or corrupt PHASE-04
  artifacts:** abort import and surface `ANALYSIS_DATA_UNAVAILABLE` at runtime;
  do not regenerate outputs or calculate routes in the API.
- **Canonical/analytical ID mismatch or primary-stop absence:** abort import
  and retain the last committed versioned bundle.
- **Unreviewed Access Quality suggestions:** preserve pending status/evidence;
  do not expose suggestions as approved claims.
- **Version mixing:** all analytical queries take the same explicit version and
  the importer requires one complete bundle. Never fall back to “latest.”
- **Serverless connection pressure or pooler incompatibility:** use the
  transaction-mode runtime URL, a single module-level very-small pool,
  parameterized unnamed statements, and no session-dependent behavior. Use the
  separate administrative URL for migrations/imports/long transactions.
- **Breaking frontend/API shape after later integration:** freeze these
  response/error shapes in route tests before PHASE-06; a required breaking
  change is a documented contract/version review.

## 16. Rollback / Recovery

Migrations remain forward-only and are applied first to a dedicated test
database through the administrative connection. If a schema migration has been
deployed, create a reviewed compensating forward migration rather than
rewriting applied history. A failed administrative import rolls back its
transaction, leaving the prior committed version data unchanged.

For a valid rerun, the importer replaces only the requested analysis-version
bundle inside one transaction; a corrected/new approved analytical version can
be loaded beside the former version, then `RUJAK_ANALYSIS_VERSION` can be
changed deliberately after verification. Recovery never edits raw files or
PHASE-01–04 outputs. API rollback is a normal application deployment rollback
or route/module reversion; it does not require deleting raw or generated
spatial artifacts. Before any manual production action, record migration IDs,
active version, importer summary, and source hashes.

## 17. Open Questions

1. What Supabase project/region and dedicated test database will be used, and
   who will provision the separate runtime transaction-pooler and
   administrative/import/test URLs, least-privileged runtime role, and
   PostGIS installation schema?
2. Which Supabase Data API schema-exposure configuration proves `rujak` is not
   exposed, and can the provisioned roles satisfy the documented revokes/grants?
3. Should PHASE-05 standardize a pinned Supabase CLI as an app dev dependency
   or use an organization-provided pinned CLI? The repository currently has
   neither; this must be decided before finalizing executable migration scripts.

## 18. Definition of Done

PHASE-05 is complete only when all of the following are evidenced, not merely
planned:

- the PHASE-04 dependency gate is satisfied before PHASE-05 implementation,
  based on the approved external review of the final PASS evidence; no separate
  repository artifact is required for that verdict;
- PostGIS migration(s) apply successfully to a clean test database with the
  catalog-confirmed approved extension schema, non-exposed `rujak` schema,
  specified schema/constraints/indexes, and proven client-role denial;
- the importer validates and transactionally loads the approved P0 source
  bundle through the administrative connection, reports matching counts,
  preserves canonical IDs and versioned analytical facts/4326 geometry, parses
  quoted/multiline CSV evidence safely, and safely reruns/coexists under its
  declared contract;
- all five endpoints meet the documented validation, empty-state, error,
  geometry, category, observability, and secret-boundary behavior;
- the primary stop Halte Simpang Dukuh is served by the real backend backed by
  PostgreSQL/PostGIS, and its discovery counts/values (including
  `walking_distance_m = total_distance_m`) match the approved precomputed
  access source exactly;
- equivalent five-minute results are a subset of ten-minute results, category
  filtering is source-backed, and no request-time routing/fallback occurs;
- API responses never fabricate Access Quality approval, price, rating,
  opening hours, menu details, or restaurant ranking; and
- migration/import/API/lint/build/regression tests pass against the approved
  real PostgreSQL/PostGIS test environment using separate runtime/admin
  connections, with no PHASE-01–04 output or PHASE-06 work changed. Mock-only
  tests cannot satisfy this condition.
