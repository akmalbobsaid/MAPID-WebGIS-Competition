# RUJAK — Route for Urban Journey & Accessibility to Kuliner

RUJAK is a P0 spatial decision-support WebGIS for the MAPID WebGIS Competition 2026. It helps users explore culinary places reachable on foot from a selected transit stop in the nine-stop Central Surabaya study cluster.

The product proof chain is deliberately narrow: **Transit → network reachability → culinary → local stop evidence → decision**. It uses precomputed walking-network results, not live routing or a straight-line radius.

## P0 scope

- 9 canonical transit stops and 355 canonical culinary POIs.
- Precomputed 5- and 10-minute walking catchments at a 1.3 m/s assumption.
- Active analytical version: `p0-central-v1`.
- Local, human-approved stop-condition evidence for all nine stops.
- Optional AGUS assistant that may only use canonical discovery data and approved local evidence.

P0 does not include prices, ratings, opening hours, live transit, full navigation, current-location routing, or multimodal planning. See [limitations](docs/LIMITATIONS.md).

## Run locally

Requirements: Node.js 24.x and npm 11+. The web application lives in `apps/web`.

```powershell
Push-Location apps/web
npm ci
npm run dev
Pop-Location
```

Local runtime values belong in `apps/web/.env.local`; never commit them. Copy the variable names and policy from [.env.example](.env.example). `NEXT_PUBLIC_MAPID_MAPS_API_KEY` is intentionally browser-visible but must be restricted to the approved domain/referrer. Database and Gemini variables are server-only.

## Validate

```powershell
Push-Location apps/web
npm run lint
npm run test
npm run build
Pop-Location

node scripts/database/import-p0.mjs --validate-only --require-all-approved --analysis-version p0-central-v1
.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests/spatial -p "test_*.py"
```

The database verification commands require an authorized runtime database configuration and are read-only. Do not run migrations or imports against a production project without explicit authorization and a verified backup.

## Deployment contract

The frozen production architecture is one Vercel Next.js application rooted at `apps/web`, with same-origin API routes and Supabase PostgreSQL/PostGIS. Configure only the required production variables listed in `.env.example`, confirm `/maplibre/maplibre-gl-worker.mjs` is publicly reachable, and run the [demo script](docs/DEMO_SCRIPT.md) against the deployed URL. Production credentials, domain approvals, and deployment access are not stored in this repository.

## Data and evidence

- [Data contract](data/README.md) and [P0 data dictionary](docs/data/P0_DATA_DICTIONARY.md)
- [Technical freeze](docs/codex/decisions/P0_TECHNICAL_FREEZE.md)
- [Routing validation](docs/methodology/ROUTING_VALIDATION_P0.md)
- [Phase-08 release report](docs/codex/reports/PHASE-08-integration-qa-hardening-deployment-competition-release-REPORT.md)
