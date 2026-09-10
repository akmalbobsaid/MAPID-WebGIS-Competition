# P0 Technical Freeze

**Status:** recorded after Phase-0 technical verification on 2026-09-11. This
freeze establishes a foundation only; it does not authorize Phase-1 processing
without the canonical source datasets.

## Frozen implementation decisions

| Decision | Frozen value |
| --- | --- |
| `frontend` | Next.js 16.3.4 + TypeScript in `apps/web` |
| `map_library` | Leaflet + React Leaflet (decision only; intentionally not installed in Phase-0) |
| `backend` | Next.js route handlers in `apps/web` |
| `database` | Supabase-managed PostgreSQL + PostGIS |
| `spatial_runtime` | Python 3.13; repository-local `.venv-spatial` to be created with standard-library `venv`; future dependencies declared only in `scripts/spatial/requirements.txt`, then installed with that environment's `python -m pip` |
| `ai_provider` | Deferred until Phase 7 |
| `deployment_frontend` | Vercel |
| `deployment_backend` | Vercel serverless functions in the same Next.js application |
| `package_manager` | npm 11+ |
| `web_runtime` | Node.js 24.x |
| `study_area` | Central Surabaya Transit-Culinary Cluster: 9 P0 stops -> EPSG:32749 convex hull -> 1,000 m buffer (`study_area_p0`); routing-processing extent = `study_area_p0` + 300 m |
| `primary_demo_stop` | `6a92c77152d86e03b51db962` — Halte Simpang Dukuh |
| `analysis_version` | `p0-central-v1` |
| `raw_data_location` | `data/raw/{transit,culinary,network}/` |
| `interim_data_location` | `data/interim/` |
| `processed_data_location` | `data/processed/` |

## Rationale

Vercel is the frontend and backend target because a single Next.js application
can deploy its UI and route handlers together without operating a separate
service. Supabase supplies managed PostgreSQL with the required PostGIS
capability. Offline spatial work remains a later, non-request-path Python
workflow, keeping operational overhead appropriate for competition delivery.

Node.js 24.x is encoded in `apps/web/package.json`: it satisfies Next.js
16.3.4's `>=20.9.0` engine and is a current Vercel-supported major version.

## Spatial-runtime compatibility evidence

Python 3.13.14 is available locally. A no-install Windows `win_amd64`
`--only-binary=:all:` pip dry-run resolved all representative dependency
categories for CPython 3.13:

| Package | Later-phase role | Verified resolution evidence |
| --- | --- | --- |
| GeoPandas 1.1.4 | GeoJSON/tabular-geospatial data handling | Resolved as a universal wheel; metadata declares Python `>=3.10`. |
| Shapely 2.1.2 | Geometry operations | Resolved `cp313-cp313-win_amd64` wheel; metadata declares Python `>=3.10`. |
| pyproj 3.8.0 | CRS transformation | Resolved `cp313-cp313-win_amd64` wheel. |
| NetworkX 3.6.1 | Graph construction and Dijkstra/shortest paths | Resolved as a universal wheel; metadata declares `!=3.14.1,>=3.11`. |

The same dry-run also resolved GeoPandas' current binary dependencies for
CPython 3.13 (`numpy`, `pandas`, and `pyogrio`) with compatible Windows wheels.
Python 3.12 was checked as a fallback and also resolved, but it is not an
unresolved alternative: Python 3.13 is frozen because its resolver check passed.
No virtual environment, GIS package, spatial script, or dependency manifest was
created in Phase-0.

## Supabase PostgreSQL/PostGIS capability evidence

The following documentation was read on 2026-09-11 without provisioning or
connecting to a Supabase project:

- [Supabase PostGIS: Geo queries](https://supabase.com/docs/guides/database/extensions/postgis)
  documents PostGIS as a PostgreSQL extension available through Supabase,
  geography storage, indexable geospatial types, and a GiST spatial-index example.
- [PostgreSQL index documentation](https://www.postgresql.org/docs/current/indexes.html)
  documents normal relational index types including B-tree and GiST.
- [PostGIS documentation](https://postgis.net/documentation/) is the referenced
  upstream manual for PostGIS geometry/geography behavior.

This confirms the selected hosting approach can provide PostgreSQL, PostGIS,
geometry/geography-compatible storage, normal relational indexes, and spatial
indexes for later RUJAK geometry queries. No project, credential, extension,
schema, migration, table, index, dataset, or SQL statement was created.

## Source-data and spatial contract

Canonical immutable future inputs are:

| Purpose | Canonical source | Contract | Target path |
| --- | --- | --- | --- |
| Transit | `SurveiActivities.GeoJSON` | `_id` is `stop_id`; `title` is display-only; geometry is transit geometry. | `data/raw/transit/SurveiActivities.GeoJSON` |
| Culinary | `MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` | Do not invent price, rating, opening hours, or menu detail. | `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson` |
| Road proxy | `Jaringan Jalan Surabaya.geojson` | OSM-road-derived filtered walking-network proxy, not a complete pedestrian network. | `data/raw/network/Jaringan Jalan Surabaya.geojson` |

`HALTE DI KOTA SURABAYA TAHUN 2025.geojson` is excluded as the transit source;
`Jaringan Jalan Surabaya.qmd` is not the road-network source; and team survey
CSVs must not be automatically concatenated. Raw files are immutable regardless
of Git-tracking status. Reproducible transformations write to `data/interim/`
and `data/processed/`; targeted ignore rules preserve the ability to track
documentation, manifests, review artifacts, and small deterministic outputs.

The frozen processing baseline is raw/API/web EPSG:4326, metric EPSG:32749,
walking speed 1.3 m/s, and 300/600 second P0 thresholds. The later method is
offline/precomputed graph analysis plus Dijkstra, never dynamic routing per
request or a Euclidean-radius replacement. Initial snap assumptions remain 30 m
for stops and 50 m for merchants and are not validated here. Fifteen minutes is
P1 and out of P0 scope.

## Environment, secrets, and Git

`.env.example` contains comments and blank future placeholders only. Phase-0
requires no runtime variables. Later local values belong in
`apps/web/.env.local`; deployed values belong in Vercel/Supabase settings.
AI credentials are not introduced because AI is deferred to Phase 7.

The intended authoritative remote is
`https://github.com/akmalbobsaid/MAPID-WebGIS-Competition.git`. The workspace
had no `.git` directory and Git was not available on `PATH`, so Git was not
initialized and no historical-secret scan, `git status`, or `git check-ignore`
validation is claimed. No non-placeholder secret assignment pattern was found in
repository-authored files created during Phase-0.

## Verified foundation and limits

`apps/web` has npm scripts for `dev`, `lint`, `build`, and `start`; lint and the
production build passed, and the local development root page returned HTTP 200.
The app is the default generated smoke-test page only. Leaflet/React Leaflet,
MAPID MAPS, Supabase clients, database objects, APIs, data ingestion, spatial
processing, and AGUS were not implemented.

Phase-1 still requires the three canonical GeoJSON inputs. MAPID MAPS
credentials/configuration are a later frontend dependency; Vercel/Supabase
project provisioning is a later infrastructure/deployment dependency; AI
provider selection and credentials are deferred until Phase 7.
