# PHASE-08 Implementation Report

**Status:** Local implementation and frozen-data QA PASS; production release gate PENDING owner-controlled prerequisites.

**Date:** 2026-09-13 (Asia/Jakarta)

## Delivered repository changes

- Replaced obsolete Phase-0/bootstrap READMEs with accurate RUJAK P0 run, validation, configuration, and Vercel-root-directory guidance.
- Added [limitations](../../LIMITATIONS.md) and a repeatable [Halte Simpang Dukuh demo script](../../DEMO_SCRIPT.md).
- Corrected the P0 data dictionary to describe the current nine-row, human-approved local Access Quality bundle while retaining its seed/provenance history and local-scope constraint.
- Hardened `RujakMap.tsx` so a missing MAPID key, initial basemap load, and MAPID style/tile/worker load error are visibly distinct. A MAPID failure does not replace the basemap or disable the independent discovery/evidence flow.
- No raw data, processed P0 output, schema, migration, lockfile, analytical version, routing/snapping/isochrone algorithm, or deployment configuration was changed.

## Local automated evidence

| Check | Result |
| --- | --- |
| `npm run lint` in `apps/web` | PASS |
| `npm run test` in `apps/web` | PASS — 15 files, 68 tests |
| `npm run build` in `apps/web` | PASS — Next.js production build completed |
| `node scripts/database/import-p0.mjs --validate-only --require-all-approved --analysis-version p0-central-v1` | PASS — 9 transit points, 355 culinary POIs, 3,195 access rows, 18 isochrones |
| `.\.venv-spatial\Scripts\python.exe -m unittest discover -s tests/spatial -p "test_*.py"` | PASS — 21 tests in 92.988 s |
| Required worker asset | PASS locally — `apps/web/public/maplibre/maplibre-gl-worker.mjs` exists |
| Browser-source secret-name scan | PASS — no `GEMINI_API_KEY`, runtime/admin database URL, or runtime password references under `apps/web/src/app` or `apps/web/src/components` |
| Client-build secret-name scan | PASS — no such server-secret names in `apps/web/.next/static` |
| `.env.example` placeholder check | PASS — no nonempty assignments |

The first non-escalated Vitest attempt could not load esbuild’s configuration because the sandbox denied access to installed runtime directories. The same unchanged suite was rerun with the approved project command outside that restriction and passed. The first spatial invocation exceeded a one-minute command limit but completed successfully when allowed its normal 97-second runtime.

## Canonical release facts revalidated locally

- Active analysis version: `p0-central-v1`.
- Canonical counts: 9 stops, 355 merchants, 3,195 stop–merchant access records, 18 isochrones.
- The import preflight required and confirmed all nine Access Quality reviews are approved.
- The frozen spatial regression suite passed without generating or changing output.
- The demo uses Halte Simpang Dukuh (`6a92c77152d86e03b51db962`), whose documented canonical discovery totals are 26 at 5 minutes and 94 at 10 minutes.

## Production-release gates not evidenced in this workspace

This repository contains no authorized Vercel project, production URL, production Supabase/PostGIS target, MAPID domain-restricted browser key, or server-only Gemini configuration. Accordingly, this report does **not** claim any production deployment, browser smoke test, public worker response, real MAPID style load, real AGUS provider success, database-runtime verification, screenshot capture, or manual visual QA.

Before public release, an authorized owner must record and execute the following using the existing runbook in the Phase-08 plan:

1. Confirm the Phase-07 external `GO NEXT` review gate.
2. Confirm Vercel builds `apps/web` (or a demonstrably equivalent configuration), configure only the approved production variables, and verify the public worker asset.
3. Verify the read-only production runtime role, canonical API parity, MAPID domain/referrer restriction, and server-only Gemini configuration.
4. Run the Halte Simpang Dukuh browser scenario, AGUS success/fallback checks, negative API smoke subset, all-nine-stop visual review, and capture sanitized artifacts.
5. Run practical Git status/history and tracked-history secret review in an environment where Git is available. Git is not present on this workstation’s PATH; this report therefore uses the above equivalent file/change summary and does not claim history inspection.

No credentials, passwords, production URLs, or request bodies are recorded here.
