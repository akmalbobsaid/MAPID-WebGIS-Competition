# PHASE-08 Plan

## 1. Goal

Prepare the existing RUJAK P0 prototype for a reliable MAPID WebGIS Competition release without changing its proof chain: Transit → Network Reachability → Culinary → Evidence → Decision. PHASE-08 will verify and harden the already-integrated canonical-data flow, prepare the frozen Vercel + Supabase deployment path, run production smoke testing, and produce final release documentation and evidence.

This is a plan only. No code, data, schema, deployment, environment, or dependency change is authorized by this document.

## 2. In Scope

- Regression, integration, spatial, data-lineage, browser, security, and production-smoke QA for the P0 flow.
- The existing Next.js UI and same-origin route handlers in `apps/web`, the Supabase/PostGIS runtime data path, MAPID Maps integration, and AGUS controlled grounding/action flow.
- Small, evidence-led release fixes only when a verified defect blocks the P0 scenario; no redesign or feature expansion.
- Reproducible deployment preparation for the frozen targets: Vercel for the single Next.js frontend/API application and Supabase PostgreSQL/PostGIS for data.
- Release documentation, including accurate `README.md`, `docs/LIMITATIONS.md`, and `docs/DEMO_SCRIPT.md`, plus an eventual PHASE-08 implementation report with command/test/smoke evidence.

## 3. Explicitly Out of Scope

- Any P1 feature: price/rating/opening-hours data, budget/rating filters, current-location routing, full navigation, multimodal planning, 15-minute access, ranking, accounts, analytics, RAG/vector DB, microservices, or background workers.
- Replacing the road-derived walking-network proxy with a different network, Euclidean buffers, or dynamic routing.
- Altering the nine-stop study area, canonical source datasets, EPSG:4326/EPSG:32749 contract, 1.3 m/s speed, 5/10-minute thresholds, snap thresholds, or `p0-central-v1` without an approved analytical change.
- Running migrations/imports, provisioning infrastructure, deploying, changing secrets, installing packages, or changing source/data during this planning pass.
- Replacing MAPID Maps with another basemap if MAPID credentials/configuration are unavailable.

## 4. Current Repository Findings

### Confirmed implementation and evidence

- The repository is a single Next.js 16.3.4 / React 19.2.8 / TypeScript application in `apps/web`, managed with npm (`apps/web/package-lock.json`), targeting Node 24.x and npm 11+ (`apps/web/package.json`). It uses Vitest 3.2.4 and ESLint 9; there is no browser/E2E framework or CI workflow in the inspected tree.
- The frozen architecture in `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` is Vercel for frontend and same-application serverless route handlers, and Supabase PostgreSQL/PostGIS for the database. No `vercel.json`, Vercel project metadata, GitHub workflow, Docker deployment file, public production URL, or production deployment record was found. PHASE-08 must verify that the Vercel project uses `apps/web` as its Root Directory, or an equivalent configuration demonstrably builds this same application; it must also verify that the deployed `/maplibre/maplibre-gl-worker.mjs` asset is reachable.
- The frontend entry is `apps/web/src/app/page.tsx`; the stateful product shell is `apps/web/src/components/rujak/RujakWebGis.tsx`. Its UI components are `RujakMap.tsx`, `DiscoveryControls.tsx`, `DiscoveryResults.tsx`, `MerchantDetail.tsx`, `TransitEvidence.tsx`, and `AgusPanel.tsx`.
- The map uses Leaflet/React Leaflet and dynamically adds MAPID Light vector tiles via MapLibre (`@maplibre/maplibre-gl-leaflet`) in `RujakMap.tsx`. It builds the style URL from `NEXT_PUBLIC_MAPID_MAPS_API_KEY`, uses the copied MapLibre worker at `/maplibre/maplibre-gl-worker.mjs`, and shows a configuration alert when the key is absent. This MAPID credential is intentionally browser-visible; release verification must confirm it is authorized for the final domain and appropriately domain/referrer restricted, not treat its normal public availability as a server-secret exposure. The current source has no demonstrated production token/domain verification or map-style load-error state; this is a release QA/focused-hardening candidate, not proof that the map is currently broken.
- The API is implemented as Node runtime Next route handlers: `GET /api/stops`, `GET /api/stops/:stopId`, `GET /api/stops/:stopId/isochrones?minutes=5|10`, `POST /api/discovery`, `GET /api/merchants/:merchantId`, and `POST /api/agus`. `apps/web/src/lib/server/api-contract.ts` supplies request IDs, structured error envelopes, bounded request metadata, latency/result-count logging, and production-safe error responses.
- `apps/web/src/lib/server/rujak-db.ts` uses server-only `pg`, checks the configured PostGIS schema, reads `DATABASE_URL_RUNTIME`, `RUJAK_ANALYSIS_VERSION`, and `RUJAK_POSTGIS_SCHEMA`, and serves precomputed results. Discovery is ordered by stored walking time then merchant ID. `supabase/migrations/20260911000000_phase05_postgis_schema.sql` contains the schema/constraints/indexes and least-privilege runtime role contract.
- Canonical spatial output is present in `data/processed/p0/`: 9 stops, 355 culinary points, graph nodes/edges, stop/merchant snaps, 3,195 stop–merchant access records, 18 isochrones, and the study-area outputs. The active frozen version is `p0-central-v1`. PHASE-03's approved report and `docs/methodology/ROUTING_VALIDATION_P0.md` confirm the final frozen `max_stop_snap_distance_m = 30` and `max_merchant_snap_distance_m = 50` (metres), rather than merely inheriting the Master Guide's initial baseline. `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` records all nine P0 stops as reviewed, Halte Simpang Dukuh as 26/94 at 5/10 minutes, and static visual review as 9/9 PASS.
- Raw canonical inputs exist at `data/raw/transit/SurveiActivities.GeoJSON`, `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson`, and `data/raw/network/Jaringan Jalan Surabaya.geojson`. The source/data contract is documented in `docs/codex/decisions/P0_TECHNICAL_FREEZE.md`, `data/README.md`, and `docs/data/P0_DATA_DICTIONARY.md`.
- Database import/verification tooling exists: `scripts/database/import-p0.mjs`, `verify-phase05-import.mjs`, `verify-phase05-db.mjs`, and `provision-rujak-runtime.mjs`. The import verifier already checks canonical counts, unique IDs, one active analysis version, access invariants, valid 5/10 isochrones, primary-stop completeness, and absence of unsupported culinary columns.
- Spatial tooling and tests exist: `scripts/spatial/p0_ingestion.py`, `p0_walking_graph.py`, `p0_routing_validation.py`, `p0_reachability_precompute.py`, `p0_phase04_static_qa.py`, with `tests/spatial/test_p0_*.py`. The Phase-07 report records that the Python suite could not run in that environment because `pyproj` and `shapely` were unavailable. That is an explicit PHASE-08 follow-up; it does not authorize recomputation or routing changes.
- The current application tests are API/unit-focused under `apps/web/tests/api`, including API contract/discovery/geometry/import tests and `agus-*.test.ts`, `gemini-provider.test.ts`, `access-quality-review.test.ts`, and `rujak-webgis-agus-action-state.test.ts`. Phase-07 records 15 files / 68 tests passed, plus lint and production build, as pre-existing evidence only.
- AGUS is server-only (`apps/web/src/lib/server/agus/*`) and uses `@google/genai` through `gemini-provider.ts`. `service.ts` derives merchant facts from `discoverMerchants`, derives access facts only from approved records, rejects unsupported price/rating/opening-hours/ranking/live-transit/full-navigation requests deterministically, and emits only validated discovery actions. The UI applies actions in two stages through `apps/web/src/lib/client/agus-map-action.ts` and the authoritative existing discovery flow.
- `data/interim/access_quality_p0_review.csv` contains all nine P0 rows with `review_status=approved`, reviewer metadata, and approved local condition tags. The Phase-07 report records 9/9 approved runtime rows; AGUS and the UI retain local-stop, not whole-route, framing.
- `.env.example` lists placeholders only. `NEXT_PUBLIC_MAPID_MAPS_API_KEY` is an intentionally browser-visible MAPID credential and must be restricted to the authorized production domain/referrer; it is not a server secret. `GEMINI_API_KEY`, database URLs containing credentials, `DATABASE_URL_ADMIN`, and `RUJAK_RUNTIME_DB_PASSWORD` are server/administrative secrets and must never enter client bundles or browser-visible runtime configuration. The file also retains unused deferred `NEXT_PUBLIC_SUPABASE_*` placeholders; production configuration must be enumerated and unnecessary public variables reviewed before release. No secret values were printed or changed in this pass.

### Phase sequencing, documentation, and release gaps

- `docs/codex/reports/PHASE-07-access-quality-finalization-agus-ai-REPORT.md` says **PASS**, records controlled live API validation, and marks its next-phase readiness PASS. PHASE-08 implementation requires external ChatGPT/owner confirmation that Phase-07 received its required `GO NEXT` review gate. The Master Guide does not require that external verdict to be committed as a repository artifact: its absence from the inspected tree is not itself a blocker. Codex must not infer or invent the approval; owner confirmation is sufficient.
- The Phase-05 evidence is against a dedicated Supabase test project and explicitly says no production database/deployment was performed. No deployed target credentials or URL can be inferred from repository files.
- `README.md` still describes only the Phase-0 smoke-test app; `apps/web/README.md` is the create-next-app boilerplate. Both are stale for the implemented system. `docs/LIMITATIONS.md` and `docs/DEMO_SCRIPT.md` do not exist. The methodology/data documents exist, but `P0_DATA_DICTIONARY.md` still describes the Access Quality CSV as initially pending and must be reconciled with the completed approved review state without losing provenance/history.
- The Git executable is unavailable on this workstation's PATH. Consequently this pass could not obtain `git status`, `git log`, `git diff --stat`, or inspect history for secrets, although the `.git` directory is present. PHASE-08 should collect that practical evidence in the actual implementation/release environment when Git is available. If Git genuinely cannot be made available there, the final report must include an equivalent change summary and explicitly state that history inspection could not be completed; absence of Git on this workstation alone is not a release blocker.
- No source or artifact proves that MAPID Maps credentials, Gemini credentials, a Vercel project/domain, production Supabase configuration, or production CORS requirements are available. These are hard-stop production readiness dependencies until verified in the authorized environment.

## 5. Source Files / Data Inputs

PHASE-08 verification will use these existing sources without changing them:

- Immutable raw transit source: `data/raw/transit/SurveiActivities.GeoJSON`; `_id` must remain canonical `stop_id`. `HALTE DI KOTA SURABAYA TAHUN 2025.geojson` must not enter release lineage.
- Immutable raw culinary source: `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson`.
- Immutable raw road source: `data/raw/network/Jaringan Jalan Surabaya.geojson`, documented as an OSM road-derived walking-network proxy.
- Canonical generated P0 source of release truth: `data/processed/p0/transit_points_p0.geojson`, `culinary_poi_p0.geojson`, `stop_snaps_p0.geojson`, `merchant_snaps_p0.geojson`, `stop_merchant_access.geojson`, `stop_isochrones.geojson`, `pedestrian_nodes.geojson`, `pedestrian_edges.geojson`, `study_area_p0.geojson`, and `routing_processing_extent.geojson`.
- Human-reviewed local evidence: `data/interim/access_quality_p0_review.csv`; only approved structured fields may be product/AGUS facts.
- Existing verification sources: `data/interim/p0/phase03_snapping_summary.json`, `phase03_halte_simpang_dukuh_validation.geojson/html/png`, `phase04_isochrone_visual_review.json`, `phase04_isochrone_validation.geojson/html`, and `phase04_isochrone_png/`.
- Database/API source of production truth: the existing `rujak` schema and active `p0-central-v1` rows, populated only through the approved importer after authorization.

## 6. Assumptions

- The frozen deployment architecture remains one Vercel Next.js application plus a separately managed Supabase/PostGIS database; no alternate hosting is assumed.
- The reported Phase-07 PASS, 9/9 approved review rows, and Phase-04 artifacts are pre-existing evidence to be revalidated, not claims of current production readiness.
- The final approved PHASE-03 snap limits are `max_stop_snap_distance_m = 30` and `max_merchant_snap_distance_m = 50`; they are confirmed by the PHASE-03 report/methodology and are not to be changed in this phase.
- `p0-central-v1` remains the only active analytical version unless an approved change alters routing outputs; deployment or documentation work alone never increments it.
- Exact Vercel project, production domain, Supabase project, MAPID restriction settings, and Gemini provider account are intentionally unknown and must be supplied/verified in an authorized deployment environment. Their absence is not to be worked around with mocks or alternate services.

## 7. Proposed Changes

### QA and regression coverage

- First run the existing lint, Vitest, build, import preflight, DB verifier, and frozen spatial suite after restoring the documented spatial test environment. Add only narrow regression tests that cover discovered release defects, especially MAPID failure signalling or a demonstrated production configuration edge case. Do not introduce Playwright/Cypress or an observability platform unless existing tooling cannot produce the required release evidence and the owner approves the addition.
- Create an executable release checklist/report template in the eventual PHASE-08 implementation report. Record commands, timestamps, sanitized URLs/statuses, test totals, active version, canonical counts, 9-stop outcomes, 5→10 monotonicity, AGUS cases, basemap/worker proof, screenshot paths, limitations, failures, and `git diff --stat` when available; otherwise include an equivalent change summary and note that history inspection could not be completed. Never record server/admin credentials or passwords.

### Integration and focused hardening

- Exercise the complete canonical primary scenario using Halte Simpang Dukuh and one actual available `category_l2`: public URL → MAPID basemap → stop → 5/10 network isochrone → 10-minute discovery/category → merchant detail distance/time → approved stop evidence → AGUS supported answer → validated map action. Compare AGUS IDs/counts/numeric facts with direct discovery/API results. Repeat the ordinary map/filter route while Gemini is unavailable to prove AI is optional.
- Preserve all API schemas where possible. If testing identifies a real defect, make the smallest backward-compatible correction with regression coverage. Never implement a fallback result, fabricated data, or independent client/AI spatial calculation.
- Verify and, only if necessary, add a small user-visible MAPID style/tile failure state that clearly distinguishes unavailable basemap configuration/load failure from valid RUJAK spatial data. The fix must not substitute another basemap and must leave discovery controls usable without falsely implying the basemap loaded.
- Verify server log events retain request ID, endpoint, stop ID where applicable, minutes/filter/category, analysis version, result count/error category, and latency without secrets or unnecessary raw questions/provider bodies. Amend only if actual logging evidence shows a required field is missing.

### Deployment/configuration and security

- Establish a repeatable Vercel deployment checklist using the existing `apps/web` build (`npm ci`, `npm run build`) and same-origin API design. Verify that the Vercel Root Directory is `apps/web`, or that an equivalent project setting demonstrably runs the same application, before deployment. Configure only the required production variables: `NEXT_PUBLIC_MAPID_MAPS_API_KEY`, `DATABASE_URL_RUNTIME`, `RUJAK_ANALYSIS_VERSION=p0-central-v1`, `RUJAK_POSTGIS_SCHEMA`, `GEMINI_API_KEY`, and `AGUS_GEMINI_MODEL`; retain `DATABASE_URL_ADMIN` and `RUJAK_RUNTIME_DB_PASSWORD` only in protected administrative context when an authorized import/migration is actually needed. After deployment, verify `GET /maplibre/maplibre-gl-worker.mjs` is reachable at the public origin and that `RujakMap.tsx` can load the worker.
- Verify the production runtime role can read the existing `rujak` data and PostGIS schema; do not run a migration/import merely for ceremony. If production data must first be created, treat the approved migration/import sequence as an explicit, authorized deployment operation with backup/readiness/verification before Vercel release.
- Review Vercel domain/branch settings, environment scope, external connections, database TLS/pooler configuration, MAPID key authorization/referrer/domain restriction, Gemini key server-only placement, public API same-origin/CORS behavior, client build output, tracked files/history when Git is available, and error/log exposure. `NEXT_PUBLIC_MAPID_MAPS_API_KEY` is expected in the browser and must have no unnecessary exposure beyond the authorized/restricted use; `GEMINI_API_KEY`, database credentials/URLs, admin credentials, and runtime passwords must not be client-visible. A committed secret triggers rotation and history-remediation escalation rather than a cosmetic removal.

### Documentation

- Replace stale README content with an accurate concise system/deployment/run overview; update `apps/web/README.md` or deliberately reduce it to an accurate app-specific pointer if keeping two READMEs remains justified.
- Update methodology/data documents only where they are stale or missing release-relevant facts; preserve detailed earlier method. Correct the Access Quality dictionary wording to distinguish the original seed role from its current human-approved state and retain its provenance/local-scope limitation.
- Create `docs/LIMITATIONS.md` and `docs/DEMO_SCRIPT.md`. The limitations document will explicitly cover the road-network proxy, incomplete sidewalk/foot-access attributes, 1.3 m/s assumption, local survey scope, missing price/rating/hours, no real-time transit, no full multimodal navigation, P0 Central Surabaya scope, and network-topology dependency. The demo script will use only the deployed canonical P0 scenario centered on Halte Simpang Dukuh.

## 8. Files to Create / Modify

The exact change list is contingent on QA findings. The intended minimum is:

| Path | Intended PHASE-08 change after approval |
| --- | --- |
| `docs/codex/plans/PHASE-08-integration-qa-hardening-deployment-competition-release-PLAN.md` | This planning document only; created in this pass. |
| `docs/codex/reports/PHASE-08-integration-qa-hardening-deployment-competition-release-REPORT.md` | Create after implementation with sanitized release-gate evidence, commands, results, URLs, screenshots/artifacts, blockers, and diff summary. |
| `README.md` | Replace obsolete Phase-0-only description with accurate release overview, local validation entry points, canonical scope, and links. |
| `apps/web/README.md` | Correct/remove bootstrap-only directions in favor of app-specific scripts/configuration guidance. |
| `docs/LIMITATIONS.md` | Create required, accurate P0 limitations. |
| `docs/DEMO_SCRIPT.md` | Create repeatable production demo script around Halte Simpang Dukuh. |
| `docs/data/P0_DATA_DICTIONARY.md` | Clarify current completed Access Quality approval state and keep source/provenance/limits accurate. |
| `docs/methodology/WALKING_NETWORK_METHOD.md`, `docs/methodology/ROUTING_VALIDATION_P0.md`, `docs/methodology/ROUTING_OUTPUT_SUMMARY.md` | Modify only if QA exposes stale release facts or missing mandated clarity; no method shortening/rewrite. |
| `apps/web/src/components/rujak/RujakMap.tsx` and its narrow tests | Modify only if production QA proves MAPID load failure needs an explicit non-misleading state. |
| `apps/web/src/components/rujak/RujakWebGis.tsx`, `AgusPanel.tsx`, `TransitEvidence.tsx`, `apps/web/src/lib/server/api-contract.ts`, `apps/web/src/lib/server/agus/*`, or existing tests | Modify only for a verified P0 release defect with a smallest compatible fix and matching regression test. |
| `.env.example` | Modify only if final production variable documentation is inaccurate; placeholders only, never values. |

No schema, raw input, processed P0 output, migration, lockfile, or deployment configuration change is planned by default.

## 9. Data / DB Schema Impact

No breaking data or database schema change is planned. The existing `rujak` tables, constraints, indexes, runtime read-only role, canonical IDs, geometry SRID 4326, `p0-central-v1`, and approved Access Quality rows are the release contract.

Verification will compare raw → processed → database → API → frontend/AGUS identifiers and metadata, validate counts (9 stops, 355 merchants, 3,195 access rows, 18 isochrones, 9 approved evidence rows), prove no duplicate canonical IDs, reject stale halte lineage, and confirm no culinary price/rating/opening-hours fields or UI/AGUS claims. It will also check valid geometry/CRS and source hashes/metadata without mutating raw files.

If a production database is unpopulated or differs from the approved contract, the migration/import/provisioning path is a review-required deployment operation. Take an authorized backup/export and run existing preflight and post-import verification first; do not invent schema changes or issue ad hoc production SQL. A required breaking schema change is a hard stop.

## 10. Algorithms / Processing Details

No routing, snapping, isochrone, or accessibility algorithm change is planned. PHASE-08 will revalidate the frozen offline/precomputed Dijkstra result chain:

- raw/API/web GeoJSON stays EPSG:4326; metric validation remains EPSG:32749;
- all nine stop snaps are routable under the PHASE-03-confirmed `max_stop_snap_distance_m = 30 m`, representative merchant snaps are checked against the PHASE-03-confirmed `max_merchant_snap_distance_m = 50 m`, and connector-inclusive total distance/time remain internally consistent at 1.3 m/s;
- 5-minute results are a subset of 10-minute results; thresholds are unrounded 300/600 seconds; all isochrones are valid, nested, include the origin/connector, and have no suspicious disconnected islands;
- primary-stop paths/geometry, where exposed in the API/product, are visually compared with the reviewed Phase-03 evidence; and
- `p0-central-v1` is checked in processed outputs, DB versioned relations, API responses, frontend state, and AGUS result metadata.

Automated reproducibility/data checks will reuse `tests/spatial`, `scripts/spatial/p0_phase04_static_qa.py`, processed manifests, and database verifier outputs. Do not rerun precomputation simply to create fresh output. Any discrepancy between analytical outputs and the PHASE-03-confirmed 30 m/50 m limits, CRS/unit regression, implausible topology, or need to alter frozen routing assumptions is a hard stop for review.

## 11. API Contract Impact

No intentional API contract change is planned. The release suite will verify:

- `GET /api/stops` returns exactly canonical P0 stops; `GET /api/stops/:stopId` and `GET /api/merchants/:merchantId` preserve canonical IDs and safe not-found/validation responses.
- `GET /api/stops/:stopId/isochrones?minutes=5|10` permits only 5/10 and returns the active-version stored network isochrone.
- `POST /api/discovery` accepts only the existing strict schema, normalizes/categories against canonical data, preserves sort order, returns valid zero results, and matches precomputed source for the primary stop and sampled remaining stops.
- `POST /api/agus` preserves the Phase-07 controlled contract, all supported P0 outcomes, safe limitations/provider failures, and schema-validated map actions.
- Production database errors are classified into existing safe public error envelopes; no fabricated fallback response or internal configuration detail is returned.

The Vercel app uses same-origin calls, so no cross-origin browser access is expected. If a separate frontend/API domain is proposed during deployment, that materially differs from the freeze and must be reviewed before adding narrowly scoped CORS policy.

## 12. UI Impact

The intended UI impact is no redesign. Release QA will cover initial/loading/error/empty/retry states, selected stop, stop markers, 5/10 catchment, results/category controls, map/list/merchant-ID synchronization, walking metrics, approved local evidence, AGUS states, map action, desktop judge viewport, reasonable responsive behavior, console errors, image failures, and debug noise.

Manual browser QA is required for the actual target browser and deployed URL because no existing browser automation is present. Existing Vitest coverage remains the narrow automated layer; the plan does not assume component/E2E coverage exists. If AI fails, AGUS must show a safe retry/limitation state while ordinary stop selection, catchment display, filters, merchant selection, and evidence remain usable. If MAPID fails, the UI must not claim map success or replace the frozen basemap silently.

## 13. Tests and Validation

### Automated tests (localhost/CI-equivalent)

| Check | Expected truth and pass condition | Tool / location |
| --- | --- | --- |
| Static quality and build | Existing app compiles/lints with no release-blocking errors; production build completes. | `npm run lint`, `npm run build` in `apps/web`. |
| API/AGUS regressions | Existing route, parsing, error, geometry, importer-preflight, Access Quality, provider, grounding, and staged map-action tests pass. Add tests only for verified fixes. | `npm run test`, `npm run test:api`; `apps/web/tests/api/*`. |
| Frozen spatial tests | Ingestion/graph/snapping/reachability test expectations pass against committed canonical data; no generated output is changed. | `python -m unittest discover -s tests/spatial -p "test_*.py"` using the documented `.venv-spatial`. |
| Static data/lineage checks | Exact canonical counts/IDs/version, source names/hashes, CRS/geometries, no duplicate IDs, no unsupported fields, all 9 Access Quality approvals. | Existing importer `--validate-only --require-all-approved`; a narrow read-only script/test only if a gap is proven. |
| Build-secret review | No `GEMINI_API_KEY`, database credential/URL, admin credential, or runtime password appears in client source/build, `.env.example`, docs, or report artifacts. `NEXT_PUBLIC_MAPID_MAPS_API_KEY` is intentionally browser-visible; verify its authorization and domain/referrer restrictions instead of treating it as a server-secret leak. | Scoped `rg` patterns and inspection; do not print matched secret values. |

### Integration and reproducibility checks (authorized DB/local runtime)

Run existing read-only verifiers against the approved active database. Expected truth is processed `p0-central-v1` outputs and Phase-04 metrics. Pass requires 9/355/9/355/3,195/18/9 counts, all versioned relations restricted to `p0-central-v1`, complete access for every stop, valid nested thresholds, valid geometries, unique canonical IDs, and direct primary discovery parity (26 at 5 minutes; 94 at 10 minutes).

For every P0 stop, record routability, snap status/distance against the PHASE-03-confirmed 30 m stop / 50 m merchant limits, 5/10 counts, no unexpected missing access rows, and monotonicity. Use static renderer/output artifacts and manual overlay review for the nine 5/10 isochrone pairs: valid/nonempty geometry, origin inclusion, nesting, no suspicious islands, and no unexpected outlier beyond the documented Halte Pemuda RRI review flag. Sample merchant snap and route/path geometry from Halte Simpang Dukuh against Phase-03 visual evidence; do not treat the proxy as a complete sidewalk network.

### AGUS controlled regression (local authorized runtime, then production)

Execute and record structured assertions for: valid 5-minute, valid 10-minute, nearest, actual canonical category, valid zero result, unknown category, no selected stop, invalid stop, price, rating, opening hours, navigation, unrelated request, prompt injection/invented fact attempt, malformed provider output, timeout/rate-limit/provider error, and valid/invalid/stale map actions. Expected truth is direct backend discovery/detail data and approved Access Quality only. Merchant IDs/order and unrounded backend numeric values must match before display rounding; price/rating/hours and whole-route Access Quality claims must never appear.

### Manual browser and spatial visual QA (localhost then production)

Use the identical P0 scenario in a desktop judging viewport and a reasonable narrow viewport:

1. Open the URL and confirm no critical console errors, correct P0 labeling, and a MAPID Maps basemap that actually loads.
2. Select `6a92c77152d86e03b51db962` (Halte Simpang Dukuh); confirm stop state/marker, 5-minute network catchment, discovery, and then 10-minute network catchment/discovery.
3. Select one actual category offered by the unfiltered canonical results; verify map/list count/IDs remain synchronized. Select a merchant and compare displayed walking distance/time with API values, allowing display rounding only.
4. Confirm approved stop survey evidence/tags are local-stop framed and media failures do not damage core flow.
5. Ask a matching AGUS supported question; compare its output with the direct API/map result, click its map action, and confirm authoritative discovery refresh/highlight/fit behavior.
6. Induce/observe the supported AI failure configuration in a controlled environment and confirm core map/filter/discovery remains usable. Verify empty, invalid, API-error, retry/reset, and missing-map-config states produce no dead end.
7. Inspect all nine catchments using the existing static review artifacts and current map where possible; capture sanitized screenshots and any issue IDs.

### Production smoke and release gate

Against the deployed public URL, repeat the primary scenario and verify: public reachability; Vercel project configuration building `apps/web` (or demonstrably equivalent); `GET /maplibre/maplibre-gl-worker.mjs` returns the expected public worker asset; same-origin production API/DB connectivity; MAPID basemap; 5/10 behavior; canonical category filter; merchant detail; approved evidence; AGUS grounded response/map action; AI fallback; and no critical browser console error.

Run the following small non-mutating production API contract subset in addition to the browser scenario: a valid Halte Simpang Dukuh discovery request; an invalid-stop request; a discovery request with `max_walk_time: 15`; a valid naturally occurring canonical zero-result/category request if one exists; and structured safe error-envelope checks for the non-destructive invalid requests. Record only sanitized endpoint paths, status codes, request IDs where safe, and response-envelope fields. Do not fabricate merchants, seed data, or mutate production merely to force a zero/error case.

Security smoke must confirm that the public browser-visible MAPID credential is authorized and appropriately domain/referrer restricted, while `GEMINI_API_KEY`, database credentials/URLs, admin credentials, and runtime passwords are absent from browser-visible configuration, client build, network responses, logs, and report artifacts. Record HTTP statuses, request IDs where safe, sanitized endpoint paths, and screenshot/artifact references.

The eventual report will map evidence to all release gates: stable P0/no P1 block; accurate study label; canonical data/no invented attributes; graph/9-stop/primary/version validation; production API/discovery parity/errors; map/UI/no dead state; AGUS grounding/fallback/action; and public deployment/no exposed secret/demo docs. A build or a rendered map alone is insufficient.

## 14. Commands Codex Plans to Run

No command below is run during this planning pass. After explicit implementation approval and only in the authorized target environment, use the existing tools first:

```powershell
Push-Location apps/web
npm ci
npm run lint
npm run test
npm run test:api
npm run build
Pop-Location

node scripts/database/import-p0.mjs --validate-only --require-all-approved --analysis-version p0-central-v1

.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests/spatial -p "test_*.py"

node scripts/database/verify-phase05-import.mjs --analysis-version p0-central-v1
node scripts/database/verify-phase05-db.mjs --analysis-version p0-central-v1
```

If and only if an authorized production Supabase target needs initial data, first run the existing migration/provision/import preflight and post-import verifiers in the reviewed order using protected administrative credentials; collect a backup/export and approval record before any write. The exact Vercel deployment command/dashboard action remains an open deployment-target question; once project ownership is confirmed, verify its `apps/web` Root Directory (or demonstrably equivalent setting), run `npm ci`/`npm run build`, configure only enumerated variables in the correct Vercel environment scope, deploy the existing application, verify `/maplibre/maplibre-gl-worker.mjs` at the public origin, then run the production smoke steps above. Never put server/admin secret values on a command line or in a report.

Before release, run `git status --short`, `git diff --stat`, `git log`, and a scoped tracked-file/history secret scan when Git is available in the actual implementation/release environment. Treat results as evidence, not a license to alter history without owner approval. If Git genuinely cannot be made available, collect an equivalent file/change summary and explicitly document that history inspection could not be completed; do not fail the release solely for that tooling absence.

## 15. Risks / Failure Modes

- **Hard stop:** Phase-07's required external `GO NEXT` approval cannot be confirmed by the owner/ChatGPT, its reported PASS evidence is contradicted, or Phase-07 fundamental functionality is missing. Do not scope-creep it into PHASE-08. A missing committed/repository verdict artifact alone is not a hard stop.
- **Hard stop:** MAPID Maps key/style/domain configuration is unavailable or invalid in production. Show the explicit unavailable state; do not substitute OpenStreetMap/another basemap.
- **Hard stop:** Gemini credentials/model availability or Vercel outbound connectivity cannot be verified for release. Core discovery remains usable, but the required AGUS production happy-path gate cannot pass.
- **Hard stop:** production architecture materially differs from Vercel same-app API plus Supabase/PostGIS, production uses mocks, production analytical facts disagree across processed data/DB/API/frontend/AGUS, or a needed fix changes frozen routing/data assumptions.
- **Hard stop/escalation:** a server/admin secret (`GEMINI_API_KEY`, database credential/URL, admin credential, or runtime password) is exposed in committed history, client bundle, logs, or deployment settings. Rotate/revoke credentials and seek repository-history remediation guidance; do not merely delete a current-file line. The intended browser-visible MAPID credential is reviewed for authorization/restriction rather than treated as this category of secret exposure.
- **Hard stop:** spatial test/visual QA finds a CRS/unit regression, implausible routes, invalid/non-nested catchments, missing P0 stops, or a need for a breaking schema/API change.
- **Release risk:** no E2E tooling and no current production record mean manual browser smoke and artifact capture are essential. Do not assert visual or production success from source inspection.
- **Release risk:** map style errors may currently be less explicit than missing-key errors; validate actual load behavior before changing code.
- **Release risk:** stale documentation could overclaim capability or hide P0 limits. Documentation changes must reflect evidence, not wishful deployment status.
- **Tooling risk:** Git is unavailable in this workstation environment. Prefer working-tree/history/secret evidence from the actual release environment; if that is genuinely impossible, record an equivalent change summary and the uncompleted history inspection. This does not independently fail release sign-off.

## 16. Rollback / Recovery

- Vercel: retain the last known-good deployment URL/version and use Vercel's deployment rollback/redeploy mechanism after validating the prior build. Do not overwrite production configuration wholesale; restore only the reviewed environment scope/variable change.
- Backend: it is the same Next.js deployment, so rollback follows the frontend deployment. Re-run sanitized health/API smoke immediately after rollback.
- Database: no migration/import is planned by default. Before any approved production mutation, retain a verified backup/export and importer manifest. Roll back by restoring the last approved `p0-central-v1` dataset through the controlled process, never ad hoc deletes. A schema migration requires its own reviewed recovery plan.
- Configuration/secrets: revoke/rotate compromised values at the provider, update protected server configuration, redeploy, then verify client/build/log non-exposure. Do not put a secret back into repository files.
- Documentation: revert only the release-documentation commit/change after restoring the previous accurate content; preserve the implementation report as an auditable record and correct it with a clearly dated amendment if needed.

## 17. Open Questions

1. **Blocking:** Has ChatGPT/owner explicitly granted the required external Phase-07 `GO NEXT` after reviewing the PASS report? No repository artifact is required; owner confirmation is sufficient and must not be inferred by Codex.
2. **Blocking for production release:** Which Vercel project, production domain, and Supabase production project are authorized, are they the frozen same-app Vercel + Supabase/PostGIS architecture, and is `apps/web` configured as the Vercel Root Directory (or equivalently built)?
3. **Blocking for MAPID gate:** Is a dedicated browser-visible, referrer/domain-restricted MAPID key available and authorized for the final domain, and does the final domain satisfy MAPID requirements?
4. **Blocking for AGUS happy path:** Is a server-only Gemini key and available `AGUS_GEMINI_MODEL` configured in the authorized Vercel environment under the applicable provider terms?
5. **Non-blocking evidence question:** Where can Git status/history and practical tracked-history secret scans be run? If no release environment can provide Git, what equivalent change summary will be recorded alongside the explicit history-inspection limitation?
6. **Non-blocking until test execution:** Can the existing `.venv-spatial` be restored/provisioned from `scripts/spatial/requirements.txt` in an approved environment so the deferred frozen Python suite can run without changing outputs?

## 18. Definition of Done

PHASE-08 is complete only after a reviewed implementation report evidences all of the following:

- External ChatGPT/owner Phase-07 `GO NEXT` approval is confirmed (without requiring a repository verdict artifact), and P0 remains limited to the accurately labeled Central Surabaya nine-stop cluster.
- The deployed public RUJAK URL executes the complete Halte Simpang Dukuh canonical-data scenario reliably: MAPID basemap, network 5/10 access, actual category discovery, merchant distance/time, approved local evidence, grounded AGUS answer, and validated map action.
- The normal map/filter/discovery/evidence flow remains usable when AGUS fails, and MAPID/config/API error states do not create misleading or dead UI states.
- Canonical transit/culinary/road lineage, IDs, counts, CRS, source metadata, approved Access Quality, and absence of invented price/rating/hours are proven through raw/processed/DB/API/UI/AGUS checks.
- All nine stops are routable (or have explicitly approved exceptions); graph/access invariants including the PHASE-03-confirmed `max_stop_snap_distance_m = 30` and `max_merchant_snap_distance_m = 50`, 5→10 monotonicity, valid/nested catchments, primary route/path evidence, and active `p0-central-v1` consistency are recorded.
- Existing automated suites, restored frozen spatial suite, build, authorized DB verifier, controlled AGUS regression matrix, manual browser/spatial QA, and production smoke tests pass; any failure is fixed within scope or escalated.
- Vercel/Supabase deployment is reproducible, the Vercel Root Directory is `apps/web` or demonstrably equivalent, `/maplibre/maplibre-gl-worker.mjs` is reachable in production, production API/DB is healthy, and the focused production success/negative API smoke contracts pass.
- MAPID/Gemini production prerequisites are verified: the intentionally browser-visible MAPID credential is authorized and domain/referrer restricted, while Gemini/database/admin/runtime secrets are absent from client bundles, browser-visible configuration, responses, logs, and the report. Public endpoint/CORS/security configuration is reviewed; practical Git evidence is included when available or an equivalent change summary/history-inspection limitation is documented.
- `README.md`, methodology/data docs, `docs/LIMITATIONS.md`, and `docs/DEMO_SCRIPT.md` accurately describe the implemented release and known limits, and the final report contains sanitized commands/results/URLs/screenshots/artifacts/diff summary plus unresolved issues.

Completion is not established by a passing build, an AI response, or a rendered map in isolation.
