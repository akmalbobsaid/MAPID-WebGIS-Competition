# RUJAK

Route for Urban Journey & Accessibility to Kuliner (RUJAK) is a discovery-first
spatial decision-support WebGIS for the MAPID WebGIS Competition 2026.

## Phase-0 foundation

The smoke-test application is at `apps/web`. It uses npm, Next.js 16.3.4, and
Node.js 24.x. It intentionally contains no RUJAK product functionality, map,
database client, data-processing code, or API implementation.

```powershell
npm --prefix apps/web run dev
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

The frozen technical decisions and evidence are in
`docs/codex/decisions/P0_TECHNICAL_FREEZE.md`; the implementation record is in
`docs/codex/reports/PHASE-00-repository-reconnaissance-technical-freeze-REPORT.md`.

## Environment and data

Copy no secrets into version control. `.env.example` documents the policy; local
runtime values, when a later phase requires them, go in `apps/web/.env.local`.
See `data/README.md` for the immutable raw-data contract and output locations.
