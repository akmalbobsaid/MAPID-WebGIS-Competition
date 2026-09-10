# PHASE-00 Plan

## 1. Goal

Establish a reviewable technical freeze and a minimal smoke-testable greenfield foundation for RUJAK P0, without implementing product, GIS, database, API, or AI functionality. The approved implementation must record one explicit stack and data-convention decision set in `docs/codex/decisions/P0_TECHNICAL_FREEZE.md`, then produce `docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md` after verification.

The P0 product boundary remains discovery-first spatial decision support: surveyed transit point -> precomputed network-based walking reachability -> reachable culinary POI -> walking distance/time/category -> survey evidence -> AGUS explanation -> user decision. Dynamic routing, general navigation, marketplace/ranking behavior, multimodal planning, and policy recommendations are not part of this phase.

## 2. In Scope

- Formally record the technical-freeze decisions, source-data contract, study-area baseline, primary demo stop, runtime requirements, environment-variable strategy, and deployment strategy.
- Produce the mandatory post-implementation report using the Master Guide's full 18-section Implementation Report contract, with actual commands, pass/fail results, environment/configuration changes, deviations, evidence for every Definition-of-Done item, and readiness for the next phase.
- Establish the smallest runnable frontend foundation needed to verify the selected stack, if the repository remains greenfield at implementation time.
- Establish unambiguous npm usage, basic lint/build/smoke commands, a non-secret environment template, root ignore rules, and canonical data-path conventions.
- Create only structural documentation and empty data-location conventions required to protect raw-data immutability; do not place, transform, or process datasets.

## 3. Explicitly Out of Scope

- Importing, concatenating, validating, or transforming transit, culinary, road, or survey files.
- Creating migrations, provisioning PostgreSQL/PostGIS, creating tables, or defining analytical schemas beyond documenting the future database choice.
- Road filtering, CRS transformation, graph construction, snapping, Dijkstra, isochrones, accessibility calculations, or any dynamic routing service.
- Discovery APIs, map UI/business flow, AGUS, MAPID MAPS integration, Access Quality processing, P1 work, and any user-facing feature.
- Dependency installation during this planning pass; Phase-0 implementation may install only the selected smoke-test foundation dependencies after review approval.

## 4. Current Repository Findings

Reconnaissance was performed before this plan was written. At that time, `Get-ChildItem -Force -Recurse` found zero repository items. Consequently, this is a greenfield directory, not a partially initialized or working application.

- No `.git` directory, source files, package/dependency manifests, lockfiles, Python project files, data directories, documentation, test configuration, Docker/Compose configuration, deployment configuration, `.env`/`.env.example`, or `.gitignore` existed.
- No frontend or backend implementation, map/GIS library, MAPID MAPS configuration, database/PostgreSQL/PostGIS configuration, spatial scripts, raw/generated-data convention, CI/CD workflow, lint/type-check/build tooling, or tests could be identified because no repository files existed.
- The local shell exposes Node `v24.16.0`, npm `11.13.0`, and Python `3.13.14`; these are workstation observations, not project runtime requirements. `pnpm`, `yarn`, and `git` were not available on `PATH` during reconnaissance. In particular, repository history and Git ignore conventions cannot be inspected because no Git repository/tool is present.
- The repository owner has confirmed `https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git` as RUJAK's intended authoritative GitHub repository. It is not configured locally because the workspace has no `.git` directory and Git tooling was unavailable during reconnaissance.
- The canonical datasets named in the implementation contract were not present anywhere in this empty workspace, including `SurveiActivities.GeoJSON`, `MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson`, `Jaringan Jalan Surabaya.geojson`, or the explicitly non-canonical files. Their schemas and actual delivery locations cannot yet be verified. Checksums/provenance may be recorded later as useful lineage metadata when supplied, but are not a Phase-0 gate.

There are therefore no existing conventions to preserve. The proposed greenfield structure is a minimal adaptation of the Master Guide, not a restructuring of existing code.

## 5. Source Files / Data Inputs

The future technical-freeze record will list these immutable canonical inputs and prohibit substitutions:

| Purpose | Canonical source | Contract | Planned repository location |
| --- | --- | --- | --- |
| Transit | `SurveiActivities.GeoJSON` | `_id` is `stop_id`; `title` is display-only; geometry is transit geometry. | `data/raw/transit/SurveiActivities.GeoJSON` |
| Culinary POI | `MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` | Do not invent price, rating, opening hours, or menu details. | `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` |
| Walking-network proxy | `Jaringan Jalan Surabaya.geojson` | OSM-road-derived, filtered road-network proxy; not a complete pedestrian network. | `data/raw/roads/Jaringan Jalan Surabaya.geojson` |

`HALTE DI KOTA SURABAYA TAHUN 2025.geojson` is not a RUJAK transit source, `Jaringan Jalan Surabaya.qmd` is not a routing-network source, and team survey CSVs must not be automatically concatenated. Later outputs must be reproducible and write only to `data/interim/` and `data/processed/`; raw files are read-only inputs after receipt.

No inputs will be copied, altered, or inspected spatially in Phase-0 implementation. A superficial delivery-path or filename difference may be normalized explicitly while retaining the verified canonical source. A material dataset identity/source mismatch must be escalated before Phase-1 processing begins.

## 6. Assumptions

- Because repository evidence confirms an empty greenfield directory, Phase-0 implementation will freeze the following single stack: Next.js with TypeScript, Leaflet + React Leaflet, Next.js route handlers, Supabase-managed PostgreSQL + PostGIS, Python with `venv`, npm, and Vercel. The exact Python version is not frozen from the workstation observation alone.
- `backend` means same-repository Next.js route handlers deployed as Vercel serverless functions; it does not mean a separate service. `database` means Supabase-managed PostgreSQL with the PostGIS extension. This Vercel/Supabase pairing is appropriate for a greenfield single application: Vercel deploys the Next.js UI and co-located route handlers without operating a separate backend, while Supabase supplies managed PostgreSQL and the required PostGIS capability. Offline spatial processing remains outside request handling, keeping operations small and delivery focused for the competition.
- The web runtime baseline will be the supported Node.js version selected and verified against the resolved Next.js/Vercel requirements, using npm. The spatial environment convention is fixed as a repository-local `.venv-spatial` created with standard-library `venv`, with later dependencies declared only in `scripts/spatial/requirements.txt` and installed through that environment's `python -m pip install -r scripts/spatial/requirements.txt`. Before the final record selects one Python version, Phase-0 will use non-mutating metadata/documentation checks for representative geospatial and graph dependency classes: GeoPandas (GeoJSON/tabular geospatial handling), Shapely (geometry), pyproj (CRS transformation), and NetworkX (graph/Dijkstra). If the candidate Python 3.13 is adequately supported, record `spatial_runtime = Python 3.13`; otherwise select and record one evidenced supported version. No GIS dependency, virtual environment, or spatial manifest is created/installed in Phase-0.
- Raw/API/web CRS is EPSG:4326; metric processing CRS is EPSG:32749; walking speed is 1.3 m/s; thresholds are 300 and 600 seconds; `analysis_version` is `p0-central-v1`. The later spatial workflow is offline/precomputed graph analysis plus Dijkstra, never routing per request. The 30 m stop and 50 m merchant snap values are initial assumptions for later validation and will not be changed or validated here.
- `study_area` is the Central Surabaya Transit-Culinary Cluster: the nine frozen P0 stops, projected to EPSG:32749, convex-hulled, and buffered by 1,000 m to create `study_area_p0`; `routing_processing_extent` is that geometry plus 300 m. This is recorded only, not generated.
- `primary_demo_stop` is `6a92c77152d86e03b51db962` / Halte Simpang Dukuh unless later inspection of the canonical transit source proves a concrete blocker.
- AI provider selection is deliberately deferred to Phase 7. Until then, no AI credential or provider SDK belongs in the repository.

## 7. Proposed Changes

This is the smallest coherent Phase-0 implementation change set for the evidenced greenfield state:

1. Perform a non-mutating npm metadata check to select a supported `create-next-app` release and compatible Next.js version. Record both exact resolved versions in the implementation report and npm lockfile, then scaffold one TypeScript Next.js application at `apps/web` with the pinned/recorded generator version. It will be a smoke-test shell only: no map, API business route, data ingestion, database client, or product component. Next.js route handlers are frozen as the future backend boundary, but no route handler beyond framework defaults is required in Phase-0.
2. Perform a non-mutating spatial-runtime compatibility check before recording the final Python version. Inspect authoritative package metadata/documentation and dry-run resolver output, where available, for GeoPandas, Shapely, pyproj, and NetworkX against the candidate version and expected Windows binary-wheel support. Select one supported Python version from evidence—Python 3.13 only if it passes—and retain `.venv-spatial`/`venv`/`scripts/spatial/requirements.txt`/`python -m pip` as the single environment convention. Do not install the GIS stack or create later spatial functionality.
3. Perform a non-destructive Supabase hosting-capability verification using current official Supabase/PostGIS documentation. Record evidence that the frozen managed offering provides PostgreSQL, PostGIS, geometry/geography-compatible storage, normal relational indexes, and spatial indexing appropriate for later geometry queries. This does not provision a project, enable a live extension, create a database object, or run SQL. If the evidence does not support a stated capability, mark the technical-freeze verification failed and escalate rather than silently changing the frozen architecture.
4. Freeze Leaflet + React Leaflet in the decision record only. Do not install either dependency in Phase-0 because the smoke-test shell does not render a map; add them only in the approved frontend phase that implements map behavior.
5. Add root `.gitignore` rules for environment files, dependencies/build outputs, Python caches/virtual environments, and specifically named temporary/cache/large generated artifacts. Do not blanket-ignore `data/interim/` or `data/processed/`: documentation, review artifacts, manifests, and small deterministic outputs in those directories must remain eligible for version control. Raw-data immutability is independent of Git-tracking status and must never authorize rewriting raw files.
6. Create a root `.env.example` containing names and non-secret placeholders only. Document that local values are placed in an untracked `.env.local` file in the runtime application directory or deployed through Vercel/Supabase secret settings; actual credential names will be limited to the selected future integrations.
7. Create the logical `data/raw/`, `data/interim/`, and `data/processed/` locations with lightweight tracked placeholder documentation only if needed to represent empty directories and data-handling rules. Do not add datasets or generated files.
8. Create `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` after the scaffold and verifications are complete. It will explicitly record every frozen value below, generator/runtime and compatibility evidence, Supabase capability evidence, source-data contract, deployment rationale, and the no-business-functionality boundary.
9. Create `docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md` after approved implementation. It must use the Master Guide's full 18-section Implementation Report contract and report actual commands, pass/fail results, environment/configuration changes, deviations, Definition-of-Done evidence, and next-phase readiness.

The future decision record will freeze exactly these values, with no `X or Y` alternatives:

| Decision | Value to record |
| --- | --- |
| `frontend` | Next.js + TypeScript (`apps/web`) |
| `map_library` | Leaflet + React Leaflet |
| `backend` | Next.js route handlers in `apps/web`, deployed as Vercel serverless functions |
| `database` | Supabase-managed PostgreSQL + PostGIS |
| `spatial_runtime` | One Python version selected by documented compatibility verification; `.venv-spatial` made with `venv`; future dependencies declared only in `scripts/spatial/requirements.txt` and installed via `python -m pip` |
| `ai_provider` | Deferred until Phase 7 |
| `deployment_frontend` | Vercel |
| `deployment_backend` | Vercel serverless functions (the same Next.js application) |
| `package_manager` | npm |
| `study_area` | Central Surabaya Transit-Culinary Cluster; 9 P0 stops -> EPSG:32749 convex hull -> 1,000 m buffer (`study_area_p0`); routing extent +300 m |
| `primary_demo_stop` | `6a92c77152d86e03b51db962` — Halte Simpang Dukuh |
| `analysis_version` | `p0-central-v1` |
| `raw_data_location` | `data/raw/{transit,culinary,roads}/` |
| `interim_data_location` | `data/interim/` |
| `processed_data_location` | `data/processed/` |

Before writing the record, implementation will verify the generated manifest/lockfile identifies npm and Next.js; verify the app's lint and production build commands complete; verify the runtime versions declared in the manifest are supported by the selected deployment; verify no tracked file contains a secret; and verify all listed data paths and frozen constants exactly match this plan and the implementation contract. Actual MAPID MAPS credentials/configuration are not prerequisites to this empty foundation and must not be fabricated.

## 8. Files to Create / Modify

The exact generated framework file list depends on the selected `create-next-app` version. The Phase-0 implementation must inspect the generated diff and avoid unrelated modifications. Expected deliberate files are:

| File/path | Existing now | Why / planned change | Runtime impact | Validation |
| --- | --- | --- | --- | --- |
| `apps/web/package.json` and npm lockfile | No | Generated single-app npm manifest/lockfile; records the selected Next.js/TypeScript versions, lint scripts, engines, and npm. Leaflet is a documented freeze only, not a Phase-0 dependency. | Defines the smoke-test application. | Record resolved generator/framework versions; run `npm --prefix apps/web run lint` and `npm --prefix apps/web run build`. |
| `apps/web/*` minimal Next.js scaffold | No | Framework-generated shell only; no RUJAK business feature. | Supplies a runnable/buildable foundation. | Local dev smoke request plus production build. |
| `.gitignore` | No | Protects credentials, dependencies, build outputs, Python caches/virtual environments, and targeted temporary/cache/large generated outputs while preserving trackability of `data/interim/` and `data/processed/` documentation, review artifacts, manifests, and small deterministic outputs. | No application behavior. | Inspect specific rules and `git check-ignore` if Git becomes available; confirm neither whole data-output directory is ignored. |
| `.env.example` | No | Non-secret, documented environment-variable contract. | No runtime behavior; examples only. | Ensure it has no values resembling credentials and app starts without optional integrations. |
| `data/raw/.gitkeep`, `data/interim/.gitkeep`, `data/processed/.gitkeep`, plus one data-handling README | No | Represents canonical, immutable input/output locations in an otherwise empty repository. | No application behavior. | Inspect paths and ignore rules; no data written. |
| `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` | No | Required explicit technical decision record created only during approved Phase-0 implementation. It records the single Python version selected by compatibility evidence and the Supabase PostgreSQL/PostGIS capability evidence, in addition to all existing frozen values. | No runtime behavior. | Checklist review against the frozen-value table, spatial-runtime compatibility evidence, Supabase hosting-capability evidence, and command results. |
| `docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md` | No | Mandatory post-implementation report using the Master Guide's complete 18-section Implementation Report contract. It records actual commands/results, environment/configuration changes, deviations, Definition-of-Done evidence, spatial/Supabase verification evidence, and Phase-1 readiness. | No runtime behavior. | Review for all 18 required report sections and evidence-backed completion status. |
| `README.md` | No | A concise project entry point linking the decision record, local smoke commands, environment policy, and data rules. | No application behavior. | Read-through and command consistency check. |

The current planning document is intentionally the only file created in this planning-only run. No file in this table is created now.

## 9. Data / DB Schema Impact

No data or schema changes occur in Phase-0. Database is frozen as Supabase PostgreSQL with PostGIS, but no Supabase project, extension, credentials, connection string, migration, table, index, seed data, or spatial schema will be created. The only database-related Phase-0 activity is non-destructive documentation/metadata verification that the selected hosting approach can supply PostgreSQL, PostGIS, geometry/geography storage, normal relational indexes, and spatial indexing for later phases; no live database capability is exercised.

The only Phase-0 data impact is documenting immutable raw inputs and reserved output paths. Future preprocessing must retain raw inputs unchanged and create reproducible interim/processed outputs. The analytical method remains offline/precomputed Dijkstra on a filtered road-network walking proxy; it will not be implemented or exposed as a database query in this phase.

## 10. Algorithms / Processing Details

No algorithm is implemented or run. The decision record will preserve these later-phase processing constraints:

- API/web/raw data: EPSG:4326; metric processing: EPSG:32749.
- Compute walking reachability offline using a precomputed graph and Dijkstra, not per-request routing and not Euclidean-radius substitution.
- Use 1.3 m/s walking speed and P0 cutoffs of 300 and 600 seconds. Fifteen minutes remains P1.
- Describe the network accurately as a walking network proxy built from OSM road data through road-class filtering, not as a complete pedestrian network.
- Reserve the unvalidated initial snap assumptions: 30 m for stops and 50 m for merchants.

No study-area geometry, graph, snap, travel-time, or POI result is produced in Phase-0.

## 11. API Contract Impact

No RUJAK API contract is created or changed. The chosen future API host is Next.js route handlers in the single web application, but Phase-0 must not add discovery, spatial-analysis, AGUS, map-token, or database endpoints.

The environment template may name future variables without values; names are documentation only and do not establish an API contract or require credentials.

## 12. UI Impact

No RUJAK WebGIS UI, map, stop selector, culinary card, evidence display, AGUS interaction, or routing visualization is built. The only allowed visual result during implementation is an unbranded/default framework smoke-test page sufficient to prove the selected application can run.

Leaflet/React Leaflet is frozen as a dependency decision only. No tile provider, MAPID MAPS token, or map rendering implementation is added because credentials and product flow are absent.

## 13. Tests and Validation

Phase-0 implementation will validate the foundation in proportion to its limited scope:

- Re-run repository inventory and confirm there remains one web application and one npm lockfile; there must be no competing frontend/backend implementation or package manager.
- Verify Node/npm/Python versions, perform non-mutating npm metadata checks, select a supported generator/framework pair, encode the required Node range in the web manifest, and confirm the selected Vercel deployment supports it. The report and lockfile must state the exact resolved `create-next-app` and Next.js versions; do not rely on an unrecorded `latest` selection.
- Before recording a Python version, verify metadata/documentation and non-installing resolver compatibility for GeoPandas, Shapely, pyproj, and NetworkX. The evidence must cover their representative roles (geospatial/tabular input, geometry, CRS transformation, and graph/Dijkstra) and avoid an unnecessary Windows binary-wheel incompatibility. Record one supported version—Python 3.13 only if adequately supported—plus the `.venv-spatial`/`venv`/`scripts/spatial/requirements.txt`/`python -m pip` convention.
- Verify from current official Supabase/PostGIS documentation that Supabase-managed PostgreSQL can provide PostgreSQL, PostGIS, geometry/geography-compatible storage, normal relational indexes, and spatial indexing for later RUJAK geometry queries. Record the source URLs, access date, and capability findings in both required Phase-0 records. This verification must not provision a project, issue credentials, enable an extension, execute SQL, or create a database object.
- Run the generated lint and production build scripts. Run a local development smoke check and request the root page only; do not test product workflows.
- Verify package manifest scripts identify the authoritative lint/build/dev commands. Add no test framework merely for Phase-0 unless the generated scaffold includes one.
- Inspect `.env.example`, `.gitignore`, and files created in Phase-0 for secrets. If Git tooling is available and this workspace is confirmed as the authoritative greenfield repository, initialize Git and set the intended remote `https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git`, then use `git status --short`, `git check-ignore -v`, and `git ls-files` to confirm generated paths and local environment files are handled as documented. If Git remains unavailable, record that limitation and do not claim historical-secret scanning or Git-based validation occurred.
- Confirm the decision record contains the single values for all required stack decisions, raw/interim/processed paths, study-area formula, primary demo stop, `analysis_version = p0-central-v1`, immutable-raw policy, AI deferral, and deployment strategy.
- Confirm the mandatory implementation report uses the Master Guide's complete 18-section report contract and contains actual command results, pass/fail status, environment/configuration changes, deviations, Definition-of-Done evidence, and next-phase readiness.
- Confirm no canonical data source was transformed, no migration/database object was created, and no business feature was added.

## 14. Commands Codex Plans to Run

These are implementation-time commands, not commands executed in this planning pass. Generator/framework metadata checks occur first; the resolved values are recorded in the implementation report and lockfile before scaffolding. Generator flags may be adjusted only to match the selected generator's documented interface while preserving the frozen outcomes.

```powershell
Get-ChildItem -Force -Recurse
node --version
npm --version
python --version
$spatialPackages = 'geopandas','shapely','pyproj','networkx'
foreach ($package in $spatialPackages) { $metadata = Invoke-RestMethod "https://pypi.org/pypi/$package/json"; [pscustomobject]@{ package = $package; version = $metadata.info.version; requires_python = $metadata.info.requires_python; distributions = @($metadata.urls | ForEach-Object filename) } }
$pythonCandidates = '3.13','3.12'
foreach ($candidate in $pythonCandidates) { python -m pip install --dry-run --only-binary=:all: --python-version $candidate --platform win_amd64 --implementation cp --abi ("cp" + $candidate.Replace('.','')) --target C:\tmp\rujak-phase0-spatial-dry-run geopandas shapely pyproj networkx }
Invoke-WebRequest -UseBasicParsing -Uri 'https://supabase.com/docs/guides/database/extensions/postgis'
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.postgresql.org/docs/current/indexes.html'
Invoke-WebRequest -UseBasicParsing -Uri 'https://postgis.net/documentation/'
$generatorVersion = npm view create-next-app version
$nextCandidateVersion = npm view next version
npm view "create-next-app@$generatorVersion" engines --json
npm view "next@$nextCandidateVersion" engines --json
npx --yes "create-next-app@$generatorVersion" apps/web -- --typescript --eslint --app --use-npm --src-dir --import-alias "@/*"
npm --prefix apps/web ls next --depth=0
npm --prefix apps/web run lint
npm --prefix apps/web run build
npm --prefix apps/web run dev
Invoke-WebRequest http://localhost:3000/ -UseBasicParsing
```

The spatial commands above only retrieve/resolve metadata; `--dry-run` prevents package installation, and the temporary target is not created as a spatial environment or data artifact. Phase-0 records one Python version after reviewing the command results and authoritative package documentation; Python 3.13 is selected only if it passes. The documentation checks are read-only and must establish the stated Supabase/PostgreSQL/PostGIS hosting capabilities before the database decision is recorded. The development server will be stopped after the smoke request using its process identifier; no long-running server will be left behind. Leaflet/React Leaflet installation is intentionally absent because no Phase-0 smoke check needs map rendering. If Git tooling is available, the owner-confirmed authoritative remote will be initialized/attached only as follows: initialize only when `.git` is absent; add `origin` only when it is absent; if `origin` already differs, report the conflict and do not overwrite it. If Git tooling remains unavailable, document the limitation and perform no Git-based historical validation:

```powershell
Get-Command git -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath '.git')) { git init }
$originUrl = git remote get-url origin 2>$null
if (-not $originUrl) { git remote add origin https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git } elseif ($originUrl -ne 'https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git') { throw "Existing origin differs: $originUrl" }
git remote -v
git status --short
git check-ignore -v .env.local apps/web/.env.local data/interim/example-output
git ls-files
```

No command in this list creates database infrastructure, downloads/changes source datasets, creates the later `.venv-spatial`, installs GIS dependencies, or performs spatial analysis. Commands requiring internet access or package download will request the necessary approval at implementation time.

## 15. Risks / Failure Modes

- **Canonical datasets absent (Phase-1 entry dependency):** Phase-0 can freeze paths and contracts but cannot verify file schemas, nine-stop membership, or Halte Simpang Dukuh's `_id`. The authoritative canonical inputs must be supplied before Phase-1 ingestion/processing; their absence does not block the Phase-0 technical freeze.
- **No Git repository or Git executable:** existing history, ignore rules, branch state, and secret history cannot be inspected. During approved implementation, initialize Git and attach `https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git` only if Git tooling is available and this workspace is confirmed authoritative. If either condition is unmet, record the limitation and do not claim historical-secret scanning or Git-based validation occurred.
- **MAPID MAPS is unconfigured (later frontend/integration dependency):** no credential or integration file exists. It must not be guessed; approved credential provisioning, usage limits, and attribution requirements are needed only before map integration.
- **Vercel/Supabase accounts are unprovisioned (later infrastructure/deployment dependencies):** account ownership, Supabase region/project URL, Vercel project, and secrets need team provisioning before database integration or deployment. They do not reopen the frozen architecture decision or block the Phase-0 technical freeze.
- **Current local Node is newer than a conventional LTS baseline:** the manifest and Vercel compatibility need verification before final record. Do not freeze the workstation patch version as the sole runtime requirement.
- **Current local Python 3.13 is not evidence of spatial-stack support:** GeoPandas, Shapely, pyproj, or NetworkX metadata/resolution may reveal a Python-version or Windows-wheel issue. Do not freeze 3.13 by assumption; use the planned non-mutating checks, select one supported version if needed, and record the evidence. Do not install packages merely to resolve this risk.
- **Supabase capability evidence may be incomplete or change:** official documentation must substantiate PostgreSQL, PostGIS, geometry/geography storage, relational indexing, and spatial indexing. If it does not, mark the verification failed and escalate; do not provision a project or silently substitute hosting.
- **Generator drift:** `create-next-app` defaults/flags may change. Inspect its generated output, retain one app and npm lockfile, and avoid accepting extra product integrations.
- **Raw-data safety:** bulk copying, format conversion, or editing inside `data/raw/` would violate the contract. Later scripts must write exclusively to interim/processed locations. Ignore rules must target only temporary/cache/large generated artifacts, not whole output directories that may contain reviewable deterministic artifacts.

## 16. Rollback / Recovery

Phase-0 implementation is designed to be reversible: it adds only a smoke-test scaffold and documentation, with no remote deployment, database provisioning, migration, raw-data mutation, or business data. If the freeze is rejected, remove only the explicitly added Phase-0 files through a reviewed non-destructive change/revert workflow, then restore the directory to the approved baseline. Do not delete supplied datasets or user-authored files.

For this planning-only run, recovery is simply reverting the single planning document if external review rejects it; no other repository state has been changed.

## 17. Open Questions

These are future implementation/deployment dependencies, not unresolved critical stack alternatives or Phase-0 completion blockers:

1. **Phase-1 entry:** provide the three canonical GeoJSON files and identify their canonical source. This permits later validation of the transit `_id`, the nine frozen stops, and road/culinary inputs. Checksums/provenance may be added as useful lineage metadata when available, but are not required to close Phase-0.
2. **Later infrastructure/deployment:** provision the frozen Vercel and Supabase targets, including team ownership, Supabase region/project URL, and secure environment-variable provisioning.
3. **Later frontend/integration:** provide MAPID MAPS access method, credentials, usage limits, and attribution requirements before map implementation. No fallback provider is proposed in Phase-0.
4. **Phase-0 execution condition:** make Git tooling available to initialize the owner-confirmed authoritative remote, `https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git`, when `.git` is absent. If an existing `origin` differs, report that conflict rather than overwriting it. If Git remains unavailable, the implementation report must state that Git history and Git-based checks were unavailable; this does not prevent the non-Git Phase-0 gate from being assessed.
5. **Phase 7:** select/provision AI credentials only when AGUS work is approved; `ai_provider = deferred until Phase 7` remains frozen.

## 18. Definition of Done

The approved Phase-0 implementation is complete only when all of the following are true:

- The greenfield project can lint and build, and the default root page has passed a local smoke request (or, if an existing application appears before implementation, its equivalent verified foundation check has passed without replacement).
- Exactly one stack is recorded: Next.js + TypeScript; Leaflet + React Leaflet; Next.js route handlers; Supabase PostgreSQL + PostGIS; one compatibility-verified Python version with `.venv-spatial`/`venv`/`scripts/spatial/requirements.txt`/`python -m pip`; npm; Vercel frontend; and Vercel serverless backend.
- The decision record contains no unresolved critical `X or Y` alternative, and explicitly records the AI-provider deferral until Phase 7.
- npm is unambiguous, required runtime versions and authoritative lint/build/dev commands are documented, and environment configuration is documented without committing a secret.
- Canonical raw/interim/processed locations, immutable-raw policy, and the canonical transit/culinary/road source contracts are recorded.
- The Central Surabaya Transit-Culinary Cluster study-area formula, `6a92c77152d86e03b51db962` / Halte Simpang Dukuh primary demo stop, and `analysis_version = p0-central-v1` are recorded.
- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` exists with the verified final values, including the Vercel/Supabase rationale; evidence that Supabase hosting supports PostgreSQL, PostGIS, geometry/geography storage, relational indexes, and spatial indexes; and the one Python version selected from GeoPandas/Shapely/pyproj/NetworkX compatibility evidence with the complete `venv` + `scripts/spatial/requirements.txt` convention.
- `docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md` exists and follows the Master Guide's full 18-section Implementation Report contract, including actual commands, pass/fail results, environment/configuration changes, deviations, Python/Supabase verification evidence, evidence for every Definition-of-Done item, and next-phase readiness.
- No business functionality, dataset ingestion, spatial processing, database infrastructure, migration, discovery API, map UI, AGUS implementation, or P1 work has been added.
- Phase-1 datasets, later MAPID MAPS integration, later Vercel/Supabase provisioning, and Phase-7 AI credentials are plainly classified as future dependencies, not Phase-0 pass conditions. If Git remains unavailable, the report plainly records the absence of historical-secret scanning/Git-based validation rather than claiming it occurred.
