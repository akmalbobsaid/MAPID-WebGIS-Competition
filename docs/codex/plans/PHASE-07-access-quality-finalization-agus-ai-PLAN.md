# PHASE-07 Plan

## 1. Goal

Finalize only human-reviewed P0 Access Quality records, then add AGUS as an additive natural-language layer over the existing RUJAK data-serving chain:

```text
user question -> bounded intent extraction -> validation -> existing RUJAK server modules
-> deterministic grounded result + deterministic map action -> optional concise presentation
```

Spatial/data facts remain owned by the approved P0 pipeline and server data layer. AGUS never calculates routes, distances, isochrones, reachability, or rankings; it only interprets an allowed question and presents already-grounded facts. The user remains the decision-maker.

## 2. In Scope

- Human-owned completion of `data/interim/access_quality_p0_review.csv` for the nine P0 stops, preserving `description_raw` and marking records approved only after review.
- A minimal extension of the existing Phase-05 import validation/import path so reviewed CSV values can be safely persisted to `rujak.access_quality`; no review CMS or automatic approval.
- A server-only `POST /api/agus` endpoint supporting only the four mandatory P0 intents: `reachable_food`, `nearest_food`, `filter_food_category`, and `stop_access_info`. Existing non-AI merchant detail remains unchanged and is not an AGUS intent.
- Deterministic handling of price, rating, opening-hours, navigation/routing, live transit, general recommendation/ranking, unrelated, malformed, and prompt-injection requests.
- Server-side OpenAI Responses structured-output use for bounded intent/parameter interpretation, behind an interface with deterministic test doubles. Factual answer construction and every map action remain deterministic application logic.
- A small sidebar AGUS panel that works alongside—not instead of—Phase-06 stop selection, 5/10-minute controls, category filter, results, merchant detail, evidence, and map.
- Strict request/response/map-action schemas, tests, lightweight safe diagnostics, and manual acceptance coverage.

## 3. Explicitly Out of Scope

- Any new spatial computation or change to `p0-central-v1`, walking speed (1.3 m/s), graph topology, snap thresholds (30/50 m), Dijkstra, connector semantics, isochrone method, study area, canonical source data, or precomputed reachability.
- Price, rating, opening-hours, menus, budget filters, “best” ranking, external restaurant enrichment/scraping, web search, live transit, current-location, turn-by-turn/full navigation, multimodal routing, and 15-minute catchments.
- General chatbot behavior, agents/tool execution, arbitrary SQL, arbitrary map code/coordinates/URLs, vector DB, embeddings/RAG, microservices, workers, authentication, accounts, persistent conversations, analytics, composite Access Quality scores, or policy recommendations.
- A human review CMS or Codex/LLM approval of review values.
- PHASE-08 deployment/hardening work, except the Phase-07 server-route/runtime interface required for AGUS.

## 4. Current Repository Findings

- The repository is a single Next.js 16.3.4/React 19.2.8/TypeScript app in `apps/web`, using npm (Node 24.x); `apps/web/package.json` provides `lint`, `test`, `test:api`, and `build`. Vitest 3.2.4 is the current web test framework (`apps/web/vitest.config.ts`). There is no declared AI SDK or direct validation-library dependency. `zod`/`ajv` appear only transitively in the lockfile and must not be imported as application dependencies.
- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` freezes Next.js route handlers, Vercel serverless backend, Supabase PostgreSQL/PostGIS, EPSG:4326 serving, offline Dijkstra, `p0-central-v1`, 5/10-minute thresholds, and defers the AI-provider choice to Phase 07.
- Phase 05 is reported **PASS** in `docs/codex/reports/PHASE-05-postgresql-postgis-backend-api-REPORT.md`: the dedicated `rujak` schema was applied to the Supabase test project; nine stops, 355 merchants, 3,195 access rows, 18 isochrones, and nine access-quality rows were imported; real primary-stop discovery proved 26 five-minute and 94 ten-minute results.
- Phase 06 is reported **PASS** in `docs/codex/reports/PHASE-06-frontend-webgis-core-REPORT.md`, with completed manual browser QA for the non-AI journey. Its final readiness wording says “ready for review for GO NEXT”; no separate repository artifact records the external verdict. The external ChatGPT review workflow—not an artificial new repository file—is authoritative: Phase-07 implementation may proceed only when that workflow has actually granted `GO NEXT`; otherwise Phase-07 is **BLOCKED**. The supplied Phase-07 brief represents the baseline as having passed its required manual QA/review gate.
- Server API handlers are `apps/web/src/app/api/stops/route.ts`, `stops/[stopId]/route.ts`, `stops/[stopId]/isochrones/route.ts`, `merchants/[merchantId]/route.ts`, and `discovery/route.ts`; all declare `runtime = "nodejs"`. Shared route validation/logging is in `apps/web/src/lib/server/api-contract.ts` and routable/complete-access guards are in `apps/web/src/lib/server/route-helpers.ts`.
- `apps/web/src/lib/server/rujak-db.ts` is the server-only PostgreSQL access layer. Its reusable functions are `listStops`, `getStopDetail`, `getMerchantDetail`, `getActiveStopState`, `getIsochrone`, `assertCompleteAccess`, and `discoverMerchants`. `discoverMerchants` filters stored `reachable_5min`/`reachable_10min`, uses canonical category columns, orders by stored `walking_time_seconds` then `merchant_id`, and returns stored `total_distance_m` as `walking_distance_m`. AGUS should call these modules directly, not make internal HTTP calls.
- The current `GET /api/stops/:stopId` contract exposes raw survey evidence and only exposes structured quality fields through `CASE WHEN review_status = 'approved'`. `TransitEvidence.tsx` already uses the same guard and states that evidence concerns the surveyed stop and nearby access, not the full merchant route. This Phase-06 display contract does **not** authorize AGUS to consume, summarize, quote, interpret, or make factual answers from pending evidence.
- `supabase/migrations/20260911000000_phase05_postgis_schema.sql` has `rujak.access_quality(stop_id, evidence_text, shelter, seating, pedestrian_condition, cleanliness, traffic_condition, review_status, reviewed_by, reviewed_at)`. It already supports the needed approved fields, reviewer identity, and review timestamp. It does not need a migration for this phase.
- `data/interim/access_quality_p0_review.csv` has exactly nine canonical P0 rows, source/provenance fields, `description_raw`, suggested/approved structured columns, `reviewed_by`, `reviewed_at`, and `review_notes`. All nine have blank suggested/approved/reviewer fields and `review_status=pending`; therefore no approved structured Access Quality fact is currently available. `docs/data/P0_DATA_DICTIONARY.md` confirms this is a human-review seed and defines no controlled vocabulary for any `suggested_*` or `approved_*` field; the migration likewise stores them as unconstrained `text`.
- `scripts/database/import-p0.mjs` currently requires every review row to be `pending` and `importAccessQuality` imports only `description_raw` as `evidence_text`, null structured fields, and `pending`. This is the existing workflow that needs a minimal, separately tested review-aware extension. Its upsert intentionally preserves an existing approved row on routine re-import.
- The raw survey authority is `data/raw/transit/SurveiActivities.GeoJSON`; its nine relevant processed records are in `data/processed/p0/transit_points_p0.geojson`. The raw description is also retained in `rujak.transit_points.description_raw`. No statement may be upgraded beyond this evidence.
- The frontend controller is `apps/web/src/components/rujak/RujakWebGis.tsx`. Its reducer holds `selectedStopId`, `minutes: 5|10`, `categoryL2`, discovery, selected `merchant_id`, detail, isochrone, abort/revision state, and viewport revision. `DiscoveryControls.tsx`, `DiscoveryResults.tsx`, `MerchantDetail.tsx`, `TransitEvidence.tsx`, and `RujakMap.tsx` use only canonical IDs. The map/list round trip is already exact-ID based.
- Client contracts and fetch helpers are `apps/web/src/lib/client/rujak-types.ts` and `rujak-api.ts`. The current UI category picker uses actual current discovery `category_l2` values. Reported P0 values are `BAR`, `MINUMAN`, `RESTORAN`, and `ROTI DAN KUE`; no general taxonomy is present.
- Existing API and data verification tests are concentrated in `apps/web/tests/api/`, including `api-contract.test.ts`, `discovery-route.test.ts`, `discovery-geometry.test.ts`, importer preflight, and Phase-05 database/import verifiers. Spatial regression tests remain Python `unittest` under `tests/spatial/`.
- `.env.example` documents server-only database variables and only says AI credentials are deferred. Local secrets belong in ignored `apps/web/.env.local`; Vercel/Supabase deployment values are not stored in the repository. Git is unavailable on this machine’s PATH, so current `git status`/diff could not be inspected; this plan makes no claim about a clean worktree.
- No AGUS/chat/provider code, endpoint, environment variable, dependency, or AI provider decision exists in the application. The project uses Vercel Node serverless route handlers, which matches a server-side outbound provider call; the existing routes already opt into Node runtime.

## 5. Source Files / Data Inputs

- Frozen architecture and scope: `docs/codex/decisions/P0_TECHNICAL_FREEZE.md`; Phase-05/06 plans and reports listed above; the externally supplied RUJAK Master Technical Implementation Guide. The Master Guide is not present as a repository file, so the supplied brief remains the local planning reference for its requirements.
- Canonical facts: `data/processed/p0/transit_points_p0.geojson`, `culinary_poi_p0.geojson`, `stop_merchant_access.geojson`, and `stop_isochrones.geojson`; the runtime source is the imported `rujak` schema served by `rujak-db.ts`.
- Human-review evidence: `data/interim/access_quality_p0_review.csv` and `data/raw/transit/SurveiActivities.GeoJSON`. `description_raw` remains raw evidence, not a claim about a full stop-to-merchant corridor.
- Existing runtime contracts: `rujak-db.ts`, `api-contract.ts`, `route-helpers.ts`, existing route handlers, and client types/API helpers.
- Provider recommendation evidence: the official OpenAI JavaScript quickstart documents server-side SDK/environment-key use, and the official GPT-5 Mini model page documents Responses API and Structured Outputs support. See [quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) and [model page](https://developers.openai.com/api/docs/models/gpt-5-mini). These inform a Phase-07 recommendation; they do not authorize credentials or implementation during this planning pass.

## 6. Assumptions

- The external ChatGPT Phase-06 review workflow is the sole authoritative gate. Phase-07 implementation is permitted only after it has granted `GO NEXT`; if it has not, the work is **BLOCKED**. The repository needs no additional/artificial gate artifact.
- The current Supabase test/runtime database is available with the same complete active `p0-central-v1` bundle documented by Phase 05/06. Before implementation acceptance, this must be rechecked through the real APIs; no fixture is a production source of truth.
- A named human reviewer will review all nine CSV rows and provide `reviewed_by`, `reviewed_at`, and only evidence-supported approved values. Blank/uncertain structured values remain null. Codex must stop rather than synthesize approval.
- No controlled vocabulary presently exists for `approved_shelter`, `approved_seating`, `approved_pedestrian_condition`, `approved_cleanliness`, or `approved_traffic_condition`. Phase-07 must not invent semantic enums. The smallest safe validation domains are:

  | CSV field | Validation domain |
  | --- | --- |
  | `approved_shelter` | `null` or one normalized NFKC, trimmed, single-line, non-control-character, evidence-backed reviewer text of at most 160 Unicode code points. |
  | `approved_seating` | The same nullable bounded evidence-text domain; it does not imply a seat count or a standard of adequacy. |
  | `approved_pedestrian_condition` | The same nullable bounded evidence-text domain; it does not imply full-corridor route quality. |
  | `approved_cleanliness` | The same nullable bounded evidence-text domain; it does not create a score. |
  | `approved_traffic_condition` | The same nullable bounded evidence-text domain; it does not create a traffic level taxonomy. |
  | `review_status` | Closed set `pending | approved`. |
  | `reviewed_by` | For approved rows, normalized nonempty single-line reviewer identity of at most 120 Unicode code points. |
  | `reviewed_at` | For approved rows, a valid ISO-8601 timestamp. |
  | `review_notes` | Optional nullable bounded evidence/audit text using the same safe text rule when present. |

  Blank approved fields serialize to null. The importer additionally requires the exact canonical stop/provenance and nonempty `description_raw`, so bounded values remain human-reviewed claims traceable to row evidence rather than application-generated classifications.
- OpenAI Responses API remains the selected initial provider behind the provider abstraction, but the model is **not** a frozen RUJAK analytical or product decision. `AGUS_OPENAI_MODEL` stays server-configurable (with an example alias documented, not hard-coded as a permanent default), and its current availability plus Structured Outputs support must be verified immediately before implementation/integration. Gemini free tier is not selected by this plan; changing provider later requires the same server-only credential, structured-output, timeout, and deterministic-provider-interface checks plus plan review before any dependency/code change.
- Absence of an API key from the repository is expected and is not evidence that credentials are unavailable. Actual inability to provision a server-side provider credential is a deployment/live-integration acceptance hard stop. Unit tests use an injected fake provider and never fabricate production data.

## 7. Proposed Changes

1. **Finalize all nine human reviews through the existing CSV/import workflow.** The human owner edits only `data/interim/access_quality_p0_review.csv`: retain its provenance and `description_raw`; set every P0 row to `review_status=approved` only after review; set `reviewed_by` and valid `reviewed_at`; populate only evidence-supported `approved_*` fields; leave unsupported/uncertain fields empty/null. Suggested columns remain reviewer aids, never facts. The display framing remains “Transit Access Quality / local pedestrian access condition around the surveyed stop.” Codex must never populate a field or mark a row approved on the reviewer’s behalf.
2. **Make the importer review-aware but conservative.** Extend `scripts/database/import-p0.mjs` CSV validation to accept exactly `pending` and manually completed `approved` rows. For each approved field use the field-specific nullable bounded-text contract in Section 6, rather than pretending an absent vocabulary is an enum; do not invent semantics. Require exact nine-stop coverage, canonical IDs/version/provenance, nonempty evidence text, and reviewer/timestamp for every approved row. Map only `approved_*` columns to `rujak.access_quality`; preserve raw `description_raw` as `evidence_text`; never copy suggestions automatically. Preserve the existing routine-import rule that cannot overwrite an approved database row with a pending CSV row. A completed 9/9 approved CSV is the human-approved source for a controlled admin import; invalid/incomplete approval fails before database mutation.
3. **Add server services rather than duplicate APIs.** Create `apps/web/src/lib/server/agus/` for request parsing, intent/parameter schemas, deterministic capability checks, grounded-query orchestration, provider abstraction, response assembly, and map-action validation. Add narrowly reusable data helpers in `rujak-db.ts` only where necessary: canonical `category_l2` catalogue lookup and review-state-safe stop access. Reuse `requireRoutableStop`, `requireCompleteDiscoveryAccess`, `discoverMerchants`, and `getStopDetail` directly; do not invoke `getMerchantDetail` for AGUS.
4. **Use a two-stage bounded AGUS flow.** Before a provider call, reject only unambiguous unsupported capabilities deterministically (price, rating, opening hours, “best”/ranking, live transit, and full navigation). Do not use keyword/phrase matching to classify a generally unrelated question. Otherwise send a bounded (maximum 800 Unicode code points) question, selected canonical context, the four allowed P0 intents, 5/10 values, and current canonical `category_l2` catalogue to an injected provider’s Structured Outputs request. The provider returns only `{ interpretation: reachable_food | nearest_food | filter_food_category | stop_access_info | unsupported | unrelated, minutes?: 5|10, category_l2?: string }`; it gets no SQL, tools, coordinate data, API key, full database, merchant ID, or authority to choose a stop. The server independently parses and validates `unsupported`/`unrelated` outcomes deterministically.
5. **Ground every successful intent deterministically.** The selected stop ID comes only from validated frontend context; no name matching and no model-provided stop. `reachable_food` calls current discovery at 5/10 minutes/category null. `nearest_food` calls the same unfiltered discovery and selects its first stored-time-sorted row (no LLM ranking). `filter_food_category` checks the extracted exact normalized value against the canonical `category_l2` catalogue before discovery; a known category plus an empty result is a valid zero-result response, while an unknown category is a limitation response. `stop_access_info` calls `getStopDetail` only to establish review state: `review_status=approved` is a hard requirement before AGUS may use any Access Quality evidence or structured field. If it is pending/null/unavailable, return deterministic `STOP_ACCESS_REVIEW_UNAVAILABLE`, no raw-evidence quote/summary/interpretation, no structured tags, and `map_action: null`. Phase-06 raw-evidence display remains its separate conservative non-AI contract.
6. **Make factual presentation and map actions deterministic.** This is an intentional, stricter implementation interpretation of the Master Guide’s conceptual `LLM Explanation` stage, not an unnoticed architecture change: the LLM performs bounded natural-language intent/parameter interpretation, while all fact-bearing prose is rendered deterministically from grounded backend facts to reduce hallucination risk. Server templates render merchant names, categories, addresses, IDs, stored walking distances/times, approved Access Quality fields/evidence, review-state limitations, and other limitations only from structured results. The server constructs—not the model—the map action.
7. **Expose one narrow API contract.** Add `POST /api/agus`, `runtime = "nodejs"`, using existing `withApiRoute`. It returns a typed `assistant_text`, deterministic `intent`, structured result metadata, `map_action | null`, and a safe status/error code. It does not expose provider raw output, prompts, chain-of-thought, credentials, SQL, or internal diagnostics.
8. **Use one minimal map action shape.** Implement only `discovery_result`; it covers all actionable food-result intents and is sufficient for the current reducer. It is `{ type: "discovery_result", stop_id, minutes, category_l2, merchant_ids, highlight_merchant_id, show_isochrone: true, fit_bounds: true }`. `merchant_ids` are the exact grounded discovery order, `highlight_merchant_id` is the nearest merchant among that set or null, and minutes is 5/10. Stop-evidence, unsupported, and error results have `map_action: null`; no separate arbitrary zoom/highlight commands are needed.
9. **Add AGUS without replacing controls.** Add an `AgusPanel` near the top of the existing sidebar after `DiscoveryControls`. It shows selected-stop context, a single bounded text input, example P0 prompts, submit/loading/empty/error states, returned text, and a “Tampilkan di peta” action only when its schema has passed first-stage client validation. `RujakWebGis` applies only validated stop/minutes/category through the existing reducer, then lets ordinary Phase-06 effects fetch current discovery and isochrone facts. It never injects AGUS/model/server-result objects into discovery state.
10. **Validate map actions in two client stages.** First, before any state change, validate the `discovery_result` schema/type, canonical stop membership from loaded `stops`, 5/10 duration, category shape, merchant-ID syntax/uniqueness, and other locally authoritative facts. Then dispatch only stop/minutes/category and wait for ordinary authoritative discovery/isochrone requests. Second, after the matching current discovery response arrives, validate action `merchant_ids` and optional `highlight_merchant_id` against that fetched result, preserving order/membership. Only then select/highlight the merchant and apply final fit-bounds behavior. A stale/mismatching action stops at stage two, reports a safe AGUS action error, and leaves current Phase-06 discovery/map state uncorrupted.
11. **Provider and observability.** Add the chosen provider SDK only after approval and provider decision. If OpenAI remains selected, create `apps/web/src/lib/server/agus/openai-provider.ts` with `server-only`, `OPENAI_API_KEY`, server-configurable `AGUS_OPENAI_MODEL`, a short AbortSignal timeout, `store: false`, no tools, and JSON-schema Structured Outputs; verify the configured alias’s availability/support immediately before integration. Extend the existing route-log context with allowlisted fields only: request ID, endpoint, intent, stop ID, threshold, category, grounded result count, provider/error/validation category, and latency. Never log keys, raw provider responses, or full user prompts.

## 8. Files to Create / Modify

| Path | Planned responsibility |
| --- | --- |
| `data/interim/access_quality_p0_review.csv` | Human-owned manual review completion only; no Codex approval or inferred values. |
| `scripts/database/import-p0.mjs` | Validate/import pending or human-approved review records conservatively, preserving raw evidence and pending-overwrite protection. |
| `apps/web/tests/api/importer-preflight.test.ts` | Approved/pending CSV preflight fixtures and invalid-review rejection. |
| `supabase/migrations/20260911000000_phase05_postgis_schema.sql` | No change expected; existing table is sufficient. |
| `apps/web/src/lib/server/rujak-db.ts` | Minimal reusable category catalogue / approved-quality read helpers if required; retain discovery SQL/order/facts. |
| `apps/web/src/lib/server/api-contract.ts` | AGUS request parsing/error codes and allowlisted dynamic log metadata support. |
| `apps/web/src/lib/server/agus/contracts.ts` | Server request, intent, provider-output, grounded response, and strict map-action schemas/validators. |
| `apps/web/src/lib/server/agus/service.ts` | Deterministic unsupported handling, direct data-layer grounding, factual templates, and deterministic action construction. |
| `apps/web/src/lib/server/agus/provider.ts` | Small provider interface and result/error classification. |
| `apps/web/src/lib/server/agus/openai-provider.ts` | Server-only OpenAI Responses Structured Outputs implementation and timeout handling. |
| `apps/web/src/app/api/agus/route.ts` | Node-runtime `POST /api/agus` adapter only. |
| `apps/web/package.json`, `apps/web/package-lock.json` | Add exactly the official `openai` SDK after approval; no agent/RAG/vector dependency. |
| `.env.example` | Add blank, documented server-only provider credential and `AGUS_OPENAI_MODEL=` configuration placeholders only if OpenAI is selected; an alias is deployment configuration, never a frozen P0 decision or real key. |
| `apps/web/src/lib/client/rujak-types.ts` | AGUS response, status, and map-action types. |
| `apps/web/src/lib/client/rujak-api.ts` | Typed same-origin AGUS request helper. |
| `apps/web/src/lib/client/agus-map-action.ts` | Pure staged browser action validation: local schema/context checks before reducer state change, then authoritative-discovery membership checks before highlight/fit behavior. |
| `apps/web/src/components/rujak/AgusPanel.tsx` | Additive AGUS UI with context/loading/error/action presentation. |
| `apps/web/src/components/rujak/RujakWebGis.tsx` | Isolated AGUS resource state and reducer actions; execute only validated actions through existing canonical selection flow. |
| `apps/web/src/app/globals.css` | Small responsive styles for the AGUS panel only. |
| `apps/web/tests/api/agus-*.test.ts` | Contract, service, provider-failure, grounding, injection, and action tests. |
| `apps/web/tests/client/agus-map-action.test.ts` and `agus-panel.test.tsx` | Client validation and UI state tests, subject to the existing React test setup; add the smallest necessary test utility only if current Vitest setup cannot exercise components. |

No other schema, spatial, canonical-data, Phase-05/06 API, or map-library file change is planned.

## 9. Data / DB Schema Impact

No migration or new table is planned. The current `rujak.access_quality` columns already cover the required approved structured fields, `review_status`, `reviewed_by`, and `reviewed_at`; `transit_points.description_raw` preserves the raw evidence. `review_notes` and source provenance remain in the CSV/source artifacts and need not be duplicated into product API fields. The CSV/data dictionary/migration define no controlled approved-field vocabulary, so Phase-07 validates the explicit nullable bounded-text domains in Section 6 and preserves values as human-reviewed evidence labels rather than turning them into an invented scoring taxonomy.

The only controlled data mutation after approval is an authorized admin import of a completed human-review CSV into the existing table. Before Phase-07 PASS, all nine canonical rows must be approved and include required reviewer metadata. An approved row must include the existing raw evidence and may contain null individual condition values; null means unknown, never inferred. Normal P0 re-import cannot demote an approved database record. The importer/test contract must prove exact nine-stop coverage, 9/9 approval completion, reviewer metadata, and evidence traceability.

## 10. Algorithms / Processing Details

- Parse the AGUS JSON request strictly: only `message` and `context.selected_stop_id`/`context.selected_minutes`; reject unknown fields, non-string messages, messages over 800 code points, malformed IDs, and non-5/10 context minutes.
- Before AI invocation, use a small deterministic capability classifier only for unambiguous price, rating, opening-hours, “best”/ranking, live-transit, and full-navigation requests. Return a `LIMITATION` result with `map_action: null`; do not classify generally unrelated language this way. The bounded extractor determines `unrelated`/other unsupported interpretations, which the server then validates and renders as a deterministic limitation.
- Validate selected context with existing `parseStopId`, `requireRoutableStop`, and complete-access guard. No selected valid stop returns `STOP_CONTEXT_REQUIRED`; an invalid/nonexistent stop returns the stable validation/not-found error before provider work.
- Provider structured output is parsed as untrusted data. Its interpretation must be one of the four allowlisted P0 intents or the non-action `unsupported`/`unrelated` outcomes; minutes must be 5/10 or default only to validated selected minutes (then 5 when selection exists); category must normalize with existing `normalizeCategory` and exactly equal a current canonical `category_l2`. No merchant ID exists in the provider or AGUS request contract. Anything else fails safe as `AGUS_INTERPRETATION_UNAVAILABLE` without map mutation.
- For discovery intents, invoke the existing `discoverMerchants(stopId, minutes, category)` once after complete-access validation. Preserve its returned sort order, stored distances/times, category fields, and canonical geometry. Do not re-sort except selecting index 0 for `nearest_food`.
- Construct result metadata from those rows: count; exact ordered `merchant_ids`; optional first/highlight ID; requested validated category; and raw backend numeric values. Templates may round only display text, retaining numbers in metadata.
- For access info, `review_status=approved` is mandatory before AGUS may render the returned non-null structured fields or `evidence_text`. Pending/null/unavailable review state returns `STOP_ACCESS_REVIEW_UNAVAILABLE` and `map_action: null`, with no raw `description_raw` or pending `evidence_text` quoted, summarized, interpreted, or otherwise turned into an AGUS fact. Approved output always includes the local-condition/no-full-corridor limitation.
- Build `discovery_result` server-side only after validating every ID against the just-returned rows. In client stage one, validate shape/local context and dispatch only stop/minutes/category; do not test remote membership yet. In stage two, after matching authoritative discovery returns through the normal reducer/effects, validate `merchant_ids` and optional highlight membership/order, then select/highlight/final-fit. No provider output or action result object ever becomes executable or discovery-state data.
- The configured provider call is bounded: low output-token limit, request timeout (for example 8 seconds), no streaming, no tools, no conversation persistence, and, for OpenAI, `store: false`. Verify the configured model alias’s availability and Structured Outputs support immediately before integration. Classify missing key, 401/403, 429, timeout/abort, malformed/unfinished response, and other provider error separately for diagnostics while returning generic user-safe fallbacks.

## 11. API Contract Impact

New request:

```json
POST /api/agus
{
  "message": "Ada minuman yang bisa dijangkau dalam 5 menit?",
  "context": {
    "selected_stop_id": "6a92c77152d86e03b51db962",
    "selected_minutes": 5
  }
}
```

New success/limitation response (all fields are application-validated; `assistant_text` is a deterministic factual template):

```json
{
  "status": "ok",
  "assistant_text": "Ditemukan 3 lokasi kategori MINUMAN ...",
  "intent": "filter_food_category",
  "result": {
    "stop_id": "6a92c77152d86e03b51db962",
    "minutes": 5,
    "category_l2": "MINUMAN",
    "merchant_ids": ["..."],
    "result_count": 3,
    "analysis_version": "p0-central-v1"
  },
  "map_action": {
    "type": "discovery_result",
    "stop_id": "6a92c77152d86e03b51db962",
    "minutes": 5,
    "category_l2": "MINUMAN",
    "merchant_ids": ["..."],
    "highlight_merchant_id": null,
    "show_isochrone": true,
    "fit_bounds": true
  },
  "request_id": "..."
}
```

For `nearest_food`, metadata/action uses the unfiltered discovery merchant IDs and `highlight_merchant_id` equal to the first existing backend-sorted row. For `stop_access_info`, `result` includes only approved stop/review metadata and `map_action` is null; a pending/null review returns `status: "limitation"`, `reason: "STOP_ACCESS_REVIEW_UNAVAILABLE"`, `result: null`, and never includes raw pending evidence. Unsupported/fallback responses retain HTTP 200 only for a valid handled limitation, return `status: "limitation"`, a stable allowed `reason`, `intent: "unsupported" | "unrelated"`, `result: null`, and `map_action: null`. Validation/provider/server failures use the existing `{ error: { code, message, request_id } }` envelope and never expose provider internals.

## 12. UI Impact

AGUS is an optional sidebar panel placed below the existing discovery controls, so the map and core controls remain immediately available. It displays the selected stop name or the explicit “select a transit point first” state, follows the current 5/10-minute selection as default context, and does not override it until a validated server action is deliberately applied.

The panel has idle, submitting, successful grounded result, valid zero-result, limitation (including unreviewed stop-access information), missing-context, provider-unavailable, malformed-action, and retry states. It preserves the active map/list state while a request fails. “Show on map” is disabled until stage-one client validation succeeds; activation dispatches only canonical `stop_id`, minutes, and optional exact `category_l2` through existing reducer paths. Normal effects fetch source-of-truth discovery/isochrone data, then stage two validates action merchant membership before optional merchant highlight/final fit. No AGUS result bypasses that chain, no action injects discovery state, and no name matching is introduced.

## 13. Tests and Validation

- **Access Quality/import:** prove the current nine-row pending CSV stays valid before review; approved rows need reviewer/timestamp/evidence and exact stop coverage; malformed status, missing reviewer, invalid date, unknown stop, unapproved suggested values, invalid bounded approved-field text, and an attempted pending overwrite of approved data fail safely. Verify raw `description_raw`/`evidence_text` traceability, approved structured persistence, and null field preservation. A Phase-07 PASS acceptance test must require all 9/9 canonical records to be `approved` with required reviewer metadata; the test never supplies approval values on Codex’s behalf.
- **Intent/grounding controlled cases:** (1) valid 5-minute reachable food, (2) valid 10-minute reachable food, (3) nearest food, (4) valid category, (5) valid zero results, (6) unknown category, (7) no stop selected, (8) invalid stop, (9) price, (10) rating, (11) opening hours, (12) route/navigation, (13) unrelated, (14) prompt injection asking to ignore data/invent a restaurant, and (15) map-action validity.
- Assert referenced merchant IDs exactly equal direct structured discovery rows; nearest equals first backend-sorted result; walking metres/minutes in any result metadata/template source are backend values; only 5/10 are accepted; category unknown differs from valid category/zero result.
- Assert `stop_access_info` on an approved stop uses only approved evidence/fields and includes no full-corridor claim. Assert `stop_access_info` on a pending stop returns `STOP_ACCESS_REVIEW_UNAVAILABLE`, `map_action: null`, and no raw-evidence quote, summary, or interpretation. Assert every nullable approved field remains unknown when null; no pending/unapproved record is represented as an AGUS factual claim.
- Unit-test the provider interface using fixtures for valid structured interpretation, malformed JSON/schema, unsupported/unrelated interpretation, wrong threshold/category, timeout, rate limit, missing key, and generic error. No test double supplies merchant facts—the real service still invokes `rujak-db.ts` functions.
- Test action schemas twice: server rejection for unknown action types/nonexistent stop or merchant IDs, client stage-one rejection for malformed/unknown/duplicate/local-context-invalid actions, and client stage-two rejection after authoritative discovery for stale or discovery-membership-mismatched actions. Verify stale rejection does not corrupt current Phase-06 reducer/map/discovery state or inject action results.
- Add Indonesian paraphrase fixtures for each deterministic unsupported capability (for example, price/rating/jam buka/navigation wording) and positive Indonesian food/discovery phrasings that must reach the structured extractor rather than being falsely limited. Regression-test existing `parseDiscoveryRequest`, `discoverMerchants` ordering/facts, stop evidence approval gate, current Phase-05 discovery route, Phase-06 geometry/client coordinate helper, and ordinary core discovery when AGUS returns missing-key/provider/error/malformed-output states.
- Use structured assertions, not brittle natural-language equality: intent, validated parameters, status/reason, IDs/order, numeric values, review state, and action shape/membership. The deterministic template may receive concise snapshot/substring coverage only for required limitation/no-corridor wording.
- Run existing automated standards: `npm run lint`, `npm run test`, `npm run test:api`, and `npm run build`. Run authorized real API smoke for nine stops; Simpang Dukuh 5/10 counts (26/94); exact ID/value parity; and approved/pending evidence behavior.
- Manual browser QA: all core controls work with AGUS unavailable; selected-stop context updates; valid map action reproduces normal list/map canonical synchronization; error/empty/loading/retry do not corrupt map state; no price/rating/hours/navigation hallucination; and secret/provider raw output is absent from browser/network-visible response data.

## 14. Commands Codex Plans to Run

No implementation or test command is run in this planning pass. After external `GO`, planned commands are:

```powershell
Push-Location apps/web
# Install only the SDK for the provider selected after model/capability verification.
# If OpenAI remains selected: npm install --save-exact openai
npm ci
npm run lint
npm run test
npm run test:api
npm run build
Pop-Location

# Read-only review-data preflight before any authorized import.
node scripts/database/import-p0.mjs --validate-only --analysis-version p0-central-v1
```

Only after the external Phase-06 review workflow has granted `GO NEXT`, a human has completed all 9/9 review rows, and the owner has authorized a test-database update, securely load existing ignored admin/test variables (without printing them), run the existing transactional importer and Phase-05 read-only verifier, then run real same-origin API smoke plus manual browser QA. Credentials are never passed on a command line or written to a report. Provider integration smoke is run only after the selected provider credential and currently supported configured model have been verified server-side in the authorized test/deployment environment.

## 15. Risks / Failure Modes

- **Hard stop:** the authoritative external ChatGPT Phase-06 review workflow has not actually granted `GO NEXT`. No separate artificial repository gate file is required, but Phase-07 implementation is **BLOCKED** until that verdict exists.
- **Hard stop:** no trustworthy existing backend fact source exists for an intent, or an implementation would duplicate/recompute route/spatial facts.
- **Hard stop:** all nine approved Access Quality records with reviewer metadata are required before Phase-07 PASS. If human review is incomplete, do not manufacture approval and do not let AGUS consume pending raw evidence; Phase-06 alone may retain its existing conservative raw-evidence display.
- **Hard stop:** supporting AGUS requires a breaking API/schema redesign, frozen spatial change, provider capability workaround of major scope, vector DB/RAG/microservices/auth, external scraping, or client-side secret exposure.
- **Hard stop:** the selected provider credential, Vercel outbound connectivity, configured model availability, or Structured Outputs reliability cannot be verified for integration/deployment; show deterministic unavailable state rather than invented AI output. Repository absence of a credential is normal; inability to provision one is the hard stop.
- **Hard stop:** map action cannot be safely validated against the existing reducer/discovery state, or any required test finds AGUS facts disagree with backend/precomputed facts.
- Provider timeout, 429, 5xx, malformed output, or missing key must leave all Phase-06 controls/state untouched and produce an additive safe message. Do not retry indefinitely or log sensitive payloads.
- Prompt injection is mitigated by deterministic capability rejection, bounded model schema/no tools, independent validation, direct parameterized data access, deterministic fact rendering, and no execution of model data. These controls reduce risk but do not turn AGUS into a general-purpose assistant.
- Review wording can overstate access conditions; templates and UI must retain the local surveyed-stop disclaimer. Remote survey media remains non-core and failure-safe.

## 16. Rollback / Recovery

Application changes are additive. If AGUS causes a deployment issue, revert the Phase-07 application deployment/dependency change; Phase-05/06 APIs, database schema, spatial data, and core UI continue unchanged. Disable/remove `OPENAI_API_KEY` to force the safe unavailable state without exposing a key.

For review data, take/export the current nine-row `rujak.access_quality` state before an authorized test import and use the completed CSV as the audit source. If approved values are found incorrect, a human reviewer corrects the CSV and runs the controlled admin import after review; do not use ad hoc production SQL or a rollback that deletes raw evidence. A record reverted to pending is again unavailable to AGUS, while Phase-06 retains only its existing raw-evidence behavior.

## 17. Open Questions

1. **Human-review dependency (blocking PASS):** who will review all nine records and when will the completed approved CSV be supplied? The current CSV uses ISO-8601 `surveyed_at`; this plan requires the same valid ISO-8601 convention for `reviewed_at`. Current repository evidence says all nine are pending.
2. **Live-provider acceptance dependency:** the selected initial OpenAI integration still needs an owner-provisioned server-side credential and pre-integration confirmation that the configured `AGUS_OPENAI_MODEL` alias is available and supports Structured Outputs. This is not contradicted by the expected absence of a secret in the repository. A later Gemini change is out of this approved plan and requires review before implementation.

## 18. Definition of Done

Phase 07 can report **PASS** only when evidence shows: the four allowed P0 intents use direct structured RUJAK facts; AGUS never calculates spatial truth; walking values and exact merchant IDs agree with backend results; only 5/10 minutes work; unsupported price/rating/hours/navigation/ranking requests are explicit and non-hallucinatory; prompt injection cannot fabricate facts; **all nine canonical P0 Access Quality rows have undergone human review, each has `review_status=approved` plus required `reviewed_by`/`reviewed_at`, and Codex never supplied their values or approval**; individual approved attributes remain null/unknown when unsupported or uncertain; AGUS never uses pending evidence as a factual answer; approved local stop evidence is never extrapolated to an entire route; strict canonical-ID map actions are deterministic and validated in stages before and after authoritative discovery; malformed/stale action or provider output cannot execute UI behavior or corrupt Phase-06 state; provider/key failure leaves core discovery fully usable; required controlled/real/manual tests pass; secrets stay server-side; the external Phase-06 workflow granted `GO NEXT`; and every frozen P0 decision is preserved.

The final gate is `GO NEXT` only when AGUS is additive and never becomes the source of spatial truth.
