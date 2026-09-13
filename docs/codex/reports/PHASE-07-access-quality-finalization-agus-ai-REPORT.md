# PHASE-07 Implementation Report

## 1. Status

**PASS.** The targeted OpenAI-to-Gemini provider migration, deterministic AGUS safeguards, manual-QA regression fixes, automated regression suite, read-only database checks, and controlled live API validations passed. The existing Python spatial suite was not runnable in this environment because `pyproj` and `shapely` are absent; it is a **non-blocking Phase-08 follow-up** because Phase-07 made no spatial, analytical, canonical-data, or database changes. Phase 08 was not started.

## 2. Scope Implemented

- Replaced the AGUS runtime adapter with Google Gemini Developer API through the existing injected `AgusInterpreter` abstraction.
- Preserved all deterministic grounding, factual templates, canonical IDs, existing discovery/nearest/category/access-quality service logic, and staged client map-action flow.
- Kept Gemini limited to bounded structured Indonesian intent/parameter extraction. It has no tool, Search, Maps, file-search, code-execution, function-calling, SQL, routing, merchant-fact, or map-command authority.
- Added a narrow Indonesian `ratingnya` deterministic unsupported-capability regression.
- Fixed the manual-QA category-intent regression with server-side reconciliation of one exact normalized canonical `category_l2` mention. `MINUMAN` now forces `filter_food_category` and the deterministic discovery/map action category.
- Fixed the manual-QA opening-hours compound regression with deterministic pre-provider detection for `buka 24 jam`, `24 jam`, `jam buka`, `jam operasional`, `buka sekarang`, and `masih buka`.
- Fixed the intermittent AGUS “Tampilkan di peta” hang without changing AGUS facts or Phase-06 contracts. Every accepted action now forces a criteria revision, has a bounded 15-second recoverable action watchdog, and isochrone loading no longer disables ordinary discovery controls.

## 3. Files Added

- `apps/web/src/lib/server/agus/gemini-provider.ts`
- `apps/web/tests/api/gemini-provider.test.ts`
- This report.

## 4. Files Modified

- `apps/web/package.json` and `apps/web/package-lock.json`: removed `openai`; added exact `@google/genai` `2.22.0`.
- `.env.example`: documents only `GEMINI_API_KEY` and `AGUS_GEMINI_MODEL=gemini-3.1-flash-lite` placeholders.
- `apps/web/src/lib/server/agus/service.ts`: points to the Gemini adapter and recognizes the unambiguous Indonesian `ratingnya` form.
- `apps/web/tests/api/agus-service.test.ts`: adds category reconciliation, ordinary reachable-food, unknown-category, `ratingnya`, and opening-hours compound regressions.
- `apps/web/src/components/rujak/RujakWebGis.tsx`: forces an effect revision for each accepted staged AGUS action, clears an unsettled action safely after 15 seconds, and keeps ordinary controls usable while the independent isochrone request is loading.
- `apps/web/tests/api/rujak-webgis-agus-action-state.test.ts`: reproduces the same-criteria loading hang and covers the watchdog, stale timeout, and slow-isochrone completion paths.

`apps/web/src/lib/server/agus/openai-provider.ts` was removed. No non-plan/report OpenAI references remain. The approved Phase-07 plan retains its original OpenAI discussion as historical planning context; this report records the approved provider deviation.

Git was unavailable in the execution environment, so this explicit file list is the equivalent of `git diff --stat`.

## 5. Data Outputs Generated

None. No survey/review data, analytical output, CSV, or spatial artifact was generated or edited.

## 6. Database Migrations Applied

None. No database write, import, schema migration, spatial preprocessing, or `p0-central-v2` work was performed.

## 7. API / UI Changes

`POST /api/agus` retains its public request/response contract. Its internal provider implementation now calls `GoogleGenAI.models.generateContent` with JSON structured output and an 8-second `AbortSignal` timeout. The staged client reducer/effect flow remains intact; a valid AGUS action now increments its existing retry revision even when its criteria equal the current controls, so the normal authoritative discovery effect always runs.

## 8. Tests Run

- `npm run lint` — passed.
- `npm run test` — passed.
- `npm run test:api` — passed.
- `npm run build` — passed.
- The same four commands were rerun after the two manual-QA regression fixes — passed.
- `node scripts/database/import-p0.mjs --validate-only --require-all-approved --analysis-version p0-central-v1` — passed without a database write.
- Read-only runtime-DB aggregate checks and local API smoke/regression calls — passed as detailed below.
- `python -m unittest discover -s tests/spatial -p "test_*.py"` — could not start because the environment lacks existing `pyproj` and `shapely` dependencies. This is a **non-blocking Phase-08 follow-up**, not a Phase-07 release blocker: this phase made no spatial/data changes and did not rerun preprocessing.

## 9. Test Results

The final Vitest run passed **15 files / 68 tests**. This includes 11 Gemini-adapter tests covering all six bounded outcomes, missing key/model, 401/403/404/429/5xx provider classifications, timeout/abort, empty output, malformed JSON, and schema-invalid output.

The focused AGUS lifecycle regression reproduces the root cause: before the fix, `APPLY_AGUS_ACTION` reset discovery to idle but did not change any effect dependency when stop, minutes, and category already matched the controls. No authoritative discovery request followed, so stage two waited forever. The reducer now increments `retryVersion` for every accepted action. A 15-second watchdog clears a still-pending action and turns an unresolved discovery into a retryable error; a late/stale watchdog cannot overwrite a completed action. Stage two can commit from authoritative discovery while an independent isochrone is still loading.

`lint` and the production build passed. The build exposes the same dynamic `/api/agus` route and retains all pre-existing Phase-05/06 routes.

## 10. Data Quality / Spatial Validation Results

Read-only runtime-DB counts match the approved P0 state:

| Check | Result |
| --- | ---: |
| Transit points | 9 |
| Culinary POIs | 355 |
| Stop snaps | 9 |
| Merchant snaps | 355 |
| Stop–merchant access rows | 3,195 |
| Isochrones | 18 |
| Access Quality rows / approved | 9 / 9 |
| Halte Simpang Dukuh 5-minute discovery | 26 |
| Halte Simpang Dukuh 10-minute discovery | 94 |

`GET /api/stops/6a92c77152d86e03b51db962` returned `review_status=approved` and the expected approved fields: `Ada atap`, `Ada tempat duduk`, the approved pedestrian-condition statement, `Area secara umum cukup terawat`, and `Cukup padat`.

The strict CSV validation also confirmed the completed nine-row review bundle. No spatial algorithm, input, or output was changed. The spatial Python suite remains an unexecuted **non-blocking Phase-08 follow-up** because its pre-existing dependencies are unavailable in this environment.

## 11. Deviations from Approved Plan

**Approved deviation:** AI provider migrated from the initially implemented OpenAI adapter to Google Gemini Developer API at the project owner's request.

The generic provider abstraction, deterministic RUJAK grounding, deterministic assistant text, and staged map actions were preserved. Current official Gemini documentation was checked immediately before implementation; configured `gemini-3.1-flash-lite` supports structured outputs. The adapter uses the official `@google/genai` SDK rather than an agent/RAG framework.

## 12. Known Limitations

- The computer-use environment exposed no browser surface for automated visual/network inspection. User-provided manual QA identified the category, opening-hours, and intermittent “Tampilkan di peta” regressions; their focused fixes are covered by the post-fix live API and lifecycle evidence below. A future browser-enabled visual/network recheck is non-blocking follow-up work.
- Google free-tier data-use terms are a deployment consideration. AGUS sends only the bounded user question, selected minutes, and canonical category catalogue; it sends no database collection, media, credentials, or spatial computation.

## 13. Bugs / Follow-up

- **Phase-08 non-blocking follow-up:** provision the normal Python spatial test environment with its repository-required dependencies and run the frozen suite without changing data or algorithms. It is not a Phase-07 blocker because Phase-07 made no spatial/data changes.
- Optional future browser-enabled recheck: repaired prompts, normal reducer-dispatched discovery refresh, unsupported/provider-failure UI behavior, network payload review, and browser/server console review.
- Preserve the external Phase-06 `GO NEXT` workflow as the authoritative gate; no artificial repository gate file was introduced.

## 14. Reproduction Commands

```powershell
Set-Location apps/web
npm run lint
npm run test
npm run test:api
npm run build

Set-Location ../..
node scripts/database/import-p0.mjs --validate-only --require-all-approved --analysis-version p0-central-v1
python -m unittest discover -s tests/spatial -p "test_*.py"
```

For live validation, start the existing local app with `npm run dev -- --hostname 127.0.0.1 --port 3011`, then submit bounded JSON to local `POST /api/agus` using the configured server-side environment. Do not put a Gemini key in client requests or command history.

## 15. Environment / Configuration Changes

- Added server-only `GEMINI_API_KEY` and `AGUS_GEMINI_MODEL` documentation placeholders; existing local secret values were not overwritten or displayed.
- Configured model observed during validation: `gemini-3.1-flash-lite`.
- Installed exact application dependency: `@google/genai` `2.22.0`.
- Removed unused AGUS OpenAI environment placeholders and the `openai` application dependency.

## 16. Security Notes

- `gemini-provider.ts` is `server-only`; credentials are read only from server environment variables.
- Static source/build search found zero Gemini credential/configuration references in client source or `.next/static`, and no `NEXT_PUBLIC_` Gemini variable.
- Gemini output is parsed as JSON and independently checked by the existing strict interpretation validator.
- The public route returns deterministic grounded output only; it never returns prompts, raw Gemini output, stack traces, provider response bodies, or credentials.
- The adapter creates no tools and no persistent conversation/session. It sends no selected stop ID, merchant IDs, geometries, SQL, or Access Quality facts to Gemini.

## 17. Evidence for Definition of Done

- Gemini is on the generic AGUS runtime path; OpenAI is removed from that path.
- Controlled live API calls succeeded for 5-minute reachable food (26), 10-minute reachable food (94), nearest food, known `MINUMAN` filtering (4), approved stop access, price, rating, opening-hours, full-navigation, unrelated, and prompt-injection requests.
- After the manual-QA fixes, live `POST /api/agus` verification returned `intent=filter_food_category`, `result.category_l2=MINUMAN`, and `map_action.category_l2=MINUMAN` for `Ada minuman yang bisa dijangkau dalam 5 menit?`. The subsequent local `POST /api/discovery` criteria were exactly `{ "max_walk_time": 5, "category": "MINUMAN" }`.
- The live compound request `Kuliner apa yang buka 24 jam dan bisa dijangkau dalam 10 menit dari halte ini?` returned `status=limitation`, `reason=UNSUPPORTED_OPENING_HOURS`, `result=null`, `map_action=null`, and the explicit opening-hours-unavailable statement.
- The AGUS action lifecycle regression proves that same-criteria actions trigger a new authoritative discovery effect, unresolved actions end in an explicit recoverable error rather than indefinite loading, stale timeouts cannot corrupt completed state, and a slow isochrone does not block stage-two action completion or ordinary controls.
- Successful food actions retained canonical selected stop IDs, 5/10 values, deterministic actions, and backend result counts. The live reachable-food action's ordered 26 merchant IDs exactly matched the authoritative discovery response.
- The approved stop-access response had `review_status=approved`, no map action, and retained the local-stop/not-full-route framing.
- Unsupported and unrelated live responses had no map action. The prompt-injection attempt did not create a merchant or map action.
- Unit coverage verifies pending Access Quality is never interpreted, nullable approved fields remain unknown, provider failures/timeouts are safe, and staged map-action validation rejects stale/malformed actions.
- The Phase-07 application and data-preservation evidence is complete. The unavailable Python spatial suite is explicitly deferred as a non-blocking Phase-08 follow-up because this phase made no spatial/data changes.

## 18. Readiness for Next Phase

**PASS.** Phase-07 is complete. Do not start Phase-08 from this report; retain the external Phase-06 `GO NEXT` gate and carry the unavailable Python spatial suite as a non-blocking Phase-08 follow-up.
