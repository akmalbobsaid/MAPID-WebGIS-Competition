# PHASE-05 — PostgreSQL/PostGIS Backend API: Implementation Report

## 1. Status

**PASS.** PHASE-05 completed its real integration gate on the dedicated
Supabase test project. The approved PHASE-04 external review gate was already
satisfied before implementation; no PHASE-04 output was changed or
regenerated. No PHASE-06 work was started.

## 2. Scope Implemented

- A dedicated, non-Data-API-exposed `rujak` application schema with the seven
  required P0 tables: `transit_points`, `culinary_poi`, `stop_snaps`,
  `merchant_snaps`, `stop_merchant_access`, `stop_isochrones`, and
  `access_quality`.
- Server-only PostgreSQL/PostGIS data access, a separate admin/import
  connection contract, a least-privileged `rujak_runtime` role, transactional
  P0 import, and read-only database verifiers.
- The five P0 API handlers: stops list/detail, stop isochrones, merchant
  detail, and precomputed discovery. The runtime does not load a graph or run
  routing.
- WKT/EWKT/EWKB-to-GeoJSON server-side geometry conversion for the geometry
  types required by P0: Point, Polygon, and MultiPolygon.

## 3. Files Added

- `supabase/migrations/20260911000000_phase05_postgis_schema.sql`
- `scripts/database/import-p0.mjs`
- `scripts/database/provision-rujak-runtime.mjs`
- `scripts/database/verify-phase05-db.mjs`
- `scripts/database/verify-phase05-import.mjs`
- `apps/web/src/lib/server/geometry-wkt.ts`
- `apps/web/tests/api/geometry-wkt.test.ts`
- `apps/web/tests/api/discovery-route.test.ts`
- `apps/web/tests/api/importer-preflight.test.ts`
- `apps/web/tests/api/provision-rujak-runtime.test.ts`
- `apps/web/tests/api/verify-phase05-db.test.ts`
- `apps/web/tests/api/verify-phase05-import.test.ts`

## 4. Files Modified

- `apps/web/src/lib/server/rujak-db.ts` — server-only pool and query layer;
  runtime geometry read as text and server-side serialization.
- `apps/web/src/lib/server/api-contract.ts` — stable client errors and
  development-only sanitized database diagnostics.
- `apps/web/tests/api/api-contract.test.ts` — error-contract regression
  coverage.
- `apps/web/vitest.config.ts` — test-only `@` alias resolution required to
  exercise the Next.js route module directly.
- `apps/web/package.json` and `apps/web/package-lock.json` — pinned
  `pg@8.23.0`, CSV parser support, and `supabase@2.117.0` CLI tooling.
- `.env.example` and `.gitignore` — documented, ignored local PHASE-05
  connection contract; no credential values were added.

This file inventory is the equivalent final change summary. The Codex
execution environment used to generate this report could not invoke `git` to
obtain a current `git diff --stat`; that limitation applies only to this report
generation environment and does not claim that Git was unavailable in the
repository's implementation workflow.

## 5. Data Outputs Generated

The approved P0 bundle was imported into the Supabase **test** database with
`analysis_version = p0-central-v1`:

| Table | Rows |
| --- | ---: |
| `transit_points` | 9 |
| `culinary_poi` | 355 |
| `stop_snaps` | 9 |
| `merchant_snaps` | 355 |
| `stop_merchant_access` | 3,195 |
| `stop_isochrones` | 18 |
| `access_quality` | 9 |

No PHASE-01–04 source or output artifact was modified, and no production
database was touched.

## 6. Database Migrations Applied

`20260911000000_phase05_postgis_schema.sql` was successfully applied to the
Supabase test project.

The live catalog confirmed PostGIS **3.3.7** installed in schema
`extensions`; final test configuration used `RUJAK_POSTGIS_SCHEMA=extensions`.
The migration detects the installed extension schema and does not move an
existing PostGIS installation. It created `rujak`, its constraints and
indexes, and the intended privilege model.

## 7. API / UI Changes

Implemented server routes:

- `GET /api/stops`
- `GET /api/stops/:stopId`
- `GET /api/stops/:stopId/isochrones`
- `GET /api/merchants/:merchantId`
- `POST /api/discovery`

The API uses `p0-central-v1` precomputed analytical facts. Discovery returns
`walking_distance_m = total_distance_m`, supports only the approved 5/10
minute thresholds, and applies category filtering from canonical merchant
fields. Error responses remain generic and stable for clients.

The production-safe response contract was retained while development logs may
include an operation label, PostgreSQL error code, and sanitized error message.
They never include a connection string, password, or raw database error in an
API response.

## 8. Tests Run

Local validation completed successfully:

```powershell
node --check scripts/database/import-p0.mjs
node --check scripts/database/provision-rujak-runtime.mjs
node --check scripts/database/verify-phase05-db.mjs
node --check scripts/database/verify-phase05-import.mjs
npm --prefix apps/web run test:api
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Real, read-only Supabase test verification completed with the pre-import and
post-import verifier scripts, followed by API smoke verification against the
local Next.js runtime using the transaction-pooler runtime connection.

Following final-report review, the narrow discovery-route regression suite was
added and the local commands were rerun. This added four API tests without
changing the database, migration, importer, or runtime implementation.

### Required API-acceptance evidence mapping

| Master Guide acceptance case | Actual evidence |
| --- | --- |
| Discovery success | Real `POST /api/discovery` returned the approved primary-stop results; `discovery-route.test.ts` verifies the successful response contract. |
| Category filter | `discovery-route.test.ts` verifies normalized canonical category `ROTI` is passed to discovery; `discoverMerchants` applies the category predicate only to canonical `category_l1`/`category_l2`/`category_l3`. |
| Sort by walking time | The post-import verifier compares the runtime query's ordered merchant IDs and walking values with the canonical PHASE-04 source; its query orders by walking time, then merchant ID. |
| Invalid stop | `discovery-route.test.ts` verifies a valid-format absent stop is returned as structured `404 STOP_NOT_FOUND`. |
| Unsupported walking threshold | `api-contract.test.ts` and `discovery-route.test.ts` verify `15` is rejected as `422 UNSUPPORTED_WALK_THRESHOLD` before discovery data is queried. |
| Valid zero-result response | `discovery-route.test.ts` verifies a successful HTTP 200 response with `results: []`. |
| 5-minute → 10-minute subset | The post-import verifier checks `reachable_5min => reachable_10min` and compares both exact primary-stop sets with PHASE-04. |
| API geometry serialization | `geometry-wkt.test.ts` verifies Point EWKT/EWKB and Polygon/MultiPolygon WKT/EWKT conversion to GeoJSON. |
| No unsupported price/rating/opening-hours data | The post-import verifier queries the imported culinary schema and passed with no such unsupported fields. |
| Stable structured error contract | `api-contract.test.ts` verifies generic `INTERNAL_ERROR` behavior and safe diagnostics; `discovery-route.test.ts` verifies structured `STOP_NOT_FOUND` and threshold errors. |
| Primary demo 26/94 regression | Post-import verifier compared exact IDs and walking values with PHASE-04; real API returned 26 at 5 minutes and 94 at 10 minutes for `6a92c77152d86e03b51db962`. |

## 9. Test Results

- Initial accepted implementation suite: **17 passed** across 6 files.
- Final local suite after the four missing discovery-route regressions were
  added: **21 passed** across 7 files.
- ESLint: **passed**.
- Next.js production build: **passed**.
- Migration catalog/privilege verifier: **passed**.
- Post-import verifier: **passed**.
- Runtime role login through the shared transaction pooler: **passed**.
- Real API: `GET /api/stops` returned HTTP 200 and exactly 9 stops.
- Real API: Halte Simpang Dukuh discovery returned 26 results at 5 minutes and
  94 at 10 minutes, with `analysis_version = p0-central-v1`.

## 10. Data Quality / Spatial Validation Results

Post-import verification passed all of the following:

- exact expected row counts and canonical unique IDs (9 stops; 355 merchants);
- versioned-key uniqueness and strict active version `p0-central-v1`;
- referential integrity across canonical and analytical tables;
- routing invariants: nonnegative walking time, `total_distance_m >=
  network_distance_m`, 5-minute reachability implies 10-minute reachability,
  and the 300/600 second threshold limits;
- two valid, non-null isochrones per P0 stop, only for durations 5 and 10;
- absence of unsupported populated culinary price, rating, and opening-hours
  fields;
- runtime SELECT access and absence of runtime data-mutation privileges; and
- comparison with the canonical PHASE-04 precomputed discovery source.

Primary demo stop `6a92c77152d86e03b51db962` (Halte Simpang Dukuh) exists with
its analytical facts. The database and API both produced the approved 26
five-minute and 94 ten-minute merchant results. Five-minute results are a
subset of the ten-minute results.

## 11. Deviations from Approved Plan

The approved architecture was retained. The following real-integration
corrections were required before the final gate and are recorded explicitly:

| Finding | Resolution |
| --- | --- |
| Provisioner attempted `.query()` before its client/pool was available on an error path. | Added explicit pool lifecycle and guarded cleanup; tests cover this regression. |
| Hosted Supabase rejected broad `ALTER ROLE` attribute resets. | Reduced provisioning to the minimum supported contract: create/login/password for a new role, or update login/password for an existing role; unsafe membership/attributes are checked rather than forcibly reset. |
| Actual PostGIS schema was `extensions`, not the initially expected test value. | Used catalog-confirmed `RUJAK_POSTGIS_SCHEMA=extensions`; no extension was moved and no global search path was changed. |
| Verifier aliased `pg_constraint` as reserved keyword `constraint`. | Renamed the alias to `con`. |
| PostgreSQL metadata aggregation returned `name[]`, which was non-deterministic for JavaScript comparison. | Cast aggregated attribute names to `text[]`; ordering remains exact. |
| `extensions.ST_AsGeoJSON(...)` failed for the runtime role with PostgreSQL `42501` permission denied on schema `extensions`. | Did not broaden database privilege. Runtime reads geometry as database text and converts it server-side to GeoJSON; PostGIS schema catalog validation remains in place. |

None of these corrections altered the frozen backend architecture, routing
semantics, PHASE-04 data, or the database security boundary.

## 12. Known Limitations

- Evidence is for the dedicated Supabase **test** project; no production
  deployment or production database operation was performed.
- Runtime geometry conversion intentionally covers the P0 geometry cases:
  Point, Polygon, and MultiPolygon in WKT/EWKT/EWKB. A future geometry type
  requires an explicit parser extension and regression tests.
- The runtime role deliberately lacks `USAGE` on the PostGIS `extensions`
  schema. Future request-time PostGIS function use needs a separate
  least-privilege security decision; this phase avoids that requirement.
- The shared Session pooler remains an administrative fallback only when the
  Direct connection is not locally reachable. It is not the serverless runtime
  connection.

## 13. Bugs / Follow-up

There are no open PHASE-05 gate-blocking defects.

- Rotate the local `rujak_runtime` password through the provisioner when
  required; keep it only in ignored local secret storage.
- Run the same migration/import/verifier/API gate in a separately controlled
  production rollout only when production authorization is granted.
- Do not add PostGIS runtime SQL functions or broader extension-schema grants
  without a new security review.

## 14. Reproduction Commands

Run these only against an authorized test project after loading the ignored
root `.env.phase05.test` into the relevant process or secure shell. The file
contains values for the named variables only; it is not committed. The commands
below intentionally omit all credentials and connection strings.

```powershell
# Local dependency and repository-local CLI checks
npm --prefix apps/web ci
Push-Location apps/web
npx supabase --workdir ../.. --version

# Supabase CLI does not accept Node pg's uselibpqcompat parameter. Preserve
# sslmode=require but remove only that compatibility parameter from the
# already-securely-loaded admin URL; do not print the resulting value.
$cliDatabaseUrl = $env:DATABASE_URL_ADMIN -replace '([?&])uselibpqcompat=true(&?)', '$1'
$cliDatabaseUrl = $cliDatabaseUrl.Replace('?&', '?').TrimEnd('?', '&')

# Provision the minimal runtime role (administrative, mutating)
Pop-Location
node --env-file=.env.phase05.test scripts/database/provision-rujak-runtime.mjs

# Apply the migration from apps/web with the repository root as CLI workdir
Push-Location apps/web
npx supabase --workdir ../.. db push --db-url $cliDatabaseUrl
Remove-Variable cliDatabaseUrl
Pop-Location

# Read-only migration/catalog verification
node --env-file=.env.phase05.test scripts/database/verify-phase05-db.mjs

# Transactional P0 import (mutating)
node --env-file=.env.phase05.test scripts/database/import-p0.mjs

# Read-only post-import verification
node --env-file=.env.phase05.test scripts/database/verify-phase05-import.mjs

# Local regression checks
npm --prefix apps/web run test:api
npm --prefix apps/web run lint
npm --prefix apps/web run build

# Read-only API smoke test after securely loading runtime environment
Push-Location apps/web
npx next dev --hostname 127.0.0.1 --port 3000
# In another shell:
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/stops
# POST /api/discovery with Halte Simpang Dukuh and 5, then 10 minutes.
Pop-Location
```

The migration, provisioner, and importer commands are historical reproduction
steps and are mutating; they were not rerun for this report.

## 15. Environment / Configuration Changes

- `DATABASE_URL_ADMIN` is the administrative/import connection. The Direct
  connection was used for migration and import; the shared Session pooler is
  only a fallback if Direct connectivity is unavailable.
- `DATABASE_URL_RUNTIME` is the `rujak_runtime` server-only connection through
  the shared Transaction pooler (port 6543). The application pool is small and
  uses no session-dependent behavior or named prepared statements.
- `RUJAK_RUNTIME_DB_PASSWORD` is used only by the role provisioner and remains
  local/ignored.
- `RUJAK_ANALYSIS_VERSION=p0-central-v1` and
  `RUJAK_POSTGIS_SCHEMA=extensions` were used for the final test gate.
- The successful Node `pg` test connections used the compatibility form
  `uselibpqcompat=true&sslmode=require`. `sslmode=verify-full` previously
  failed with `self-signed certificate in certificate chain`; no later
  `verify-full` success with an explicitly configured Supabase CA certificate
  is evidenced here. `uselibpqcompat=true` is a Node `pg` connection-string
  compatibility option, not a Supabase CLI option, so it was removed only from
  the URL passed to the CLI while retaining `sslmode=require`.
- Tooling is pinned to `supabase@2.117.0`; database client is `pg@8.23.0`.

## 16. Security Notes

- `rujak` is a dedicated application schema and remains outside Supabase Data
  API exposure. The application uses server-only PostgreSQL access; no browser
  client receives a database credential.
- The migration revokes unintended privileges from `PUBLIC`, `anon`, and
  `authenticated`. Verifiers confirmed client-role denial and the runtime
  role's intended read-only access.
- `rujak_runtime` can log in and SELECT API-required data but has no CREATE,
  INSERT, UPDATE, or DELETE privilege on RUJAK objects.
- No connection string, password, token, project secret, or credential was
  committed or recorded in this report. No global `search_path` change or
  database privilege broadening was used to resolve the PostGIS runtime error.

## 17. Evidence for Definition of Done

| Approved DoD requirement | Evidence |
| --- | --- |
| PHASE-04 dependency gate | Approved external ChatGPT review granted GO NEXT after final PHASE-04 PASS evidence, including latest manual visual QA 9/9 PASS. No separate repository verdict artifact is required. |
| Migration, extension schema, dedicated security boundary | The named migration applied to the Supabase test project; catalog confirmed PostGIS 3.3.7 in `extensions`, `rujak` exists, constraints/indexes passed verifier checks, and client-role direct access was denied. |
| Import and versioned analytics | Transactional P0 import completed with the exact seven-table counts in Section 5 and strict `p0-central-v1`; post-import verifier passed integrity and source-comparison checks. |
| API behavior and secret boundary | All five P0 handlers build. The explicit acceptance-case mapping in Section 8 is covered by the final 21-test suite, verifiers, and real smoke evidence. The real backend returned HTTP 200/9 for `/api/stops`; real discovery returned 26/94 without request-time routing. Client errors stay generic and diagnostics are server-only. |
| Primary-stop regression | Primary ID `6a92c77152d86e03b51db962` is present; database and real API discovery match PHASE-04: 26 at 5 minutes and 94 at 10 minutes. |
| Threshold/category/no-fabrication rules | Verifier passed reachability nesting and timing invariants; API uses canonical category data, `walking_distance_m = total_distance_m`, and no populated unsupported price/rating/opening-hours data was found. |
| Real integration, separate connections, regression quality | Admin Direct and runtime Transaction-pooler paths were independently exercised; `rujak_runtime` login/read-only enforcement passed; local 17 API tests, lint, and build passed. |
| Scope discipline | No PHASE-01–04 outputs were changed or regenerated, no PHASE-06 work started, and no production deployment occurred. |

## 18. Readiness for Next Phase

PHASE-05 is ready for the next authorized workflow gate. The real Supabase
test integration, import, verifier, runtime least-privilege, and primary API
discovery evidence are complete. PHASE-06 has not started.
