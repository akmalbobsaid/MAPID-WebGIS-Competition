# PHASE-06 Plan

## 1. Goal

Implement the complete non-AI P0 RUJAK WebGIS journey in `apps/web`: MAPID MAPS Light basemap; all nine canonical stops; fixed 5/10-minute backend network catchments; discovery with `category_l2` filtering; direct discovery result markers; canonical ID map/list/detail synchronisation; real walking facts; review-safe stop evidence; and correct loading, empty, error, and reset recovery.

The frontend remains a visualization and state-management client. It preserves `p0-central-v1`, `stop_id`, `merchant_id`, backend discovery eligibility/order/walking values, and served isochrones. It does not calculate routes, reachability, or distances, and does not use AGUS.

## 2. In Scope

- A narrow, approved, backward-compatible PHASE-05 discovery compatibility patch that adds canonical merchant Point geometry to every normal discovery result.
- Frozen Leaflet + React Leaflet implementation and MAPID MAPS Light XYZ raster-tile integration.
- P0 client API/types/local state/components/styles for stop selection, 5/10 minutes, `category_l2`, map/list/detail synchronisation, evidence, and robust UX states.
- Backend/API/frontend regression coverage, real API smoke, and mandatory browser visual QA for the laptop/desktop judge flow.

## 3. Explicitly Out of Scope

- AGUS/LLMs/PHASE-07; price/rating/opening-hours/menu/budget filtering; ranking; 15 minutes; current location; navigation; multimodal routing; dashboards; auth; analytics; PDF; and P1 work.
- Client-side Dijkstra, snapping, walking computation, Euclidean fallback, point-in-polygon eligibility, dynamic routes, or synthetic marker locations.
- Database-schema/migration/canonical-data/spatial-output changes; redesign of PHASE-05; breaking API changes; generic-basemap fallback; iframe MAPID Viewer; MapLibre; and unrelated refactors.

## 4. Current Repository Findings

### Repository facts

- `apps/web` is the only frontend: npm with lockfile, Node `24.x`, Next `16.3.4`, React `19.2.8`, strict TypeScript, Tailwind v4, ESLint 9, and Vitest `3.2.4`.
- `src/app/page.tsx`, `layout.tsx`, and `globals.css` are still create-next-app starter files. No product UI, map library, MAPID integration, client API/types/components, E2E setup, or deployment config exists.
- `P0_TECHNICAL_FREEZE.md` freezes Leaflet + React Leaflet, Vercel same-app route handlers, analysis version `p0-central-v1`, and primary demo `6a92c77152d86e03b51db962` / Halte Simpang Dukuh. The externally supplied Master Guide is not tracked in this working tree; that is a repository observation, not a blocker.
- PHASE-01–04 artifacts and reports record nine canonical stops, 355 merchants, EPSG:4326 outputs, and offline/precomputed 5/10-minute network analysis. PHASE-05 source and tests exist. Its report records real Supabase test-project verification of 9 stops, 355 merchants, 18 isochrones, and primary results 26 (5 min) / 94 (10 min), but not a current production deployment.
- Existing API tests mostly call route modules with mocked DB helpers; current browser-facing runtime must be re-smoked during implementation before completion is claimed.

### Existing API and extension point

- `GET /api/stops` returns `{ stops }`, each with canonical `stop_id`, display name, Point geometry, source, validation status, and scope. `GET /api/stops/:stopId` adds raw survey fields, `media`, and nullable `access_quality`.
- `GET /api/stops/:stopId/isochrones?minutes=5|10` returns `{ stop_id, duration_min, geometry, method, analysis_version }`. `POST /api/discovery` accepts exact `{ stop_id, max_walk_time: 5|10, category }` and returns `{ stop, criteria, results, analysis_version }` in stored walking-time order. Structured errors use `{ error: { code, message, request_id, details? } }`.
- In `apps/web/src/lib/server/rujak-db.ts`, `DiscoveryRow` currently contains merchant identity/category/address plus walking fields. `discoverMerchants(stopId, maxWalkTime, category)` queries `rujak.stop_merchant_access AS access`, joins `rujak.culinary_poi AS merchant`, selects merchant fields and stored walking values, filters stored reachability/category, then orders by `access.walking_time_seconds`, `merchant.merchant_id`.
- `getMerchantDetail` and other server queries already select `geometry::text AS geometry_json` and use the existing `parseGeometryText` serializer from `geometry-wkt.ts`. The discovery patch must reuse that exact server-side path; it must not call `ST_AsGeoJSON` or another request-time PostGIS function because PHASE-05 deliberately avoided extension-schema privileges.
- `apps/web/src/app/api/discovery/route.ts` simply receives `discoverMerchants` results and returns them. `api-contract.ts` validates request/error contracts only; it has no discovery response type to modify. `apps/web/tests/api/discovery-route.test.ts` is the exact mocked route-contract test needing additive geometry assertions. Existing `scripts/database/verify-phase05-import.mjs` and `apps/web/tests/api/verify-phase05-import.test.ts` are the exact existing import/parity verification surfaces to extend for read-only analytical parity.

### Data/evidence/category facts

- Current `category_l1` is the broad parent `MAKANAN DAN MINUMAN`; actual `category_l2` values include `BAR`, `MINUMAN`, `RESTORAN`, and `ROTI DAN KUE`; 29 `category_l3` values exist. P0 user-facing filtering is now frozen to actual returned `category_l2` only. The exact canonical string is sent to discovery.
- All nine review seeds are `pending`. The stop API only returns structured tags when `review_status = 'approved'`; raw evidence may be presented as local surveyed-stop/surrounding evidence, never whole-route quality. Processed primary-stop media is an HTTPS PNG/JPG array at `mapid-app-chat.cdn.mapid.io`; API media is `unknown` and requires validation/failure handling.

### Approved MAPID decision and initial viewport

- MAPID MAPS is frozen as Leaflet + React Leaflet, XYZ raster tiles, Light Mapid style identifier `light`, no fallback. Tile URL pattern: `https://basemap.mapid.io/styles/light/512/{z}/{x}/{y}.png?key=${NEXT_PUBLIC_MAPID_MAPS_API_KEY}`.
- The MAPID key is a browser-consumed configuration value, not a database secret. No real key is committed; `.env.example` gets placeholder only; the previously exposed key is rotated/revoked before implementation/deployment; a dedicated RUJAK key is preferred; enable domain/referrer restriction if supported.
- Attribution must include `MAPID Maps`, `OpenMapTiles`, and `OpenStreetMap contributors` consistent with MAPID presentation.
- Initial viewport is the deterministic P0 `study_area_p0` bounds, not nine-stop bounds: longitude `112.72841800864781`–`112.75938099634507`, latitude `-7.275481894144229`–`-7.248349086279674`, with fixed Leaflet padding. These values are derived from `data/processed/p0/study_area_p0.geojson`. Interaction fit-bounds is separate and limited to a selected stop, matching isochrone/results, or selected merchant when it will not cause erratic motion.

## 5. Source Files / Data Inputs

- `docs/codex/decisions/P0_TECHNICAL_FREEZE.md` and externally supplied Master Guide — frozen requirements.
- PHASE-00–05 plans/reports and processed P0 GeoJSON — lineage/reference and real-runtime acceptance baseline, not frontend mock sources.
- `apps/web/src/lib/server/rujak-db.ts`, `geometry-wkt.ts`, `api-contract.ts`, `route-helpers.ts`, and `src/app/api/**/route.ts` — observed serving/error contract.
- `apps/web/tests/api/discovery-route.test.ts`, `scripts/database/verify-phase05-import.mjs`, and `apps/web/tests/api/verify-phase05-import.test.ts` — existing regression/verifier surfaces.
- `data/processed/p0/study_area_p0.geojson` — fixed initial study-area bounds; `data/interim/access_quality_p0_review.csv` — pending-status reference only.
- `.env.example`, ignored runtime variables, MAPID provider configuration, and Vercel settings — environment boundary; no secret is printed or committed.

## 6. Assumptions

- The approved MAPID Light XYZ URL/key works with the frozen Leaflet stack in the judge runtime. Implementation will verify whether 512px tiles require `tileSize: 512` and `zoomOffset: -1`; it must not assume these values without visual geographic-scale/zoom validation.
- The authorised PHASE-05 runtime serves complete `p0-central-v1` data. Before acceptance it will prove nine stops, primary stop, 5/10 isochrones, and discovery data through real APIs.
- The narrow discovery geometry patch can serialize canonical merchant Point geometry through existing `parseGeometryText` without changing schema/data/analytical logic. If that proves false in a breaking way, it is a hard stop.
- No global client state/query framework is needed; React reducer state and `AbortController` meet P0 needs.

## 7. Proposed Changes

1. Apply the approved backend compatibility patch only in `rujak-db.ts`: extend `DiscoveryRow` with `geometry: GeoJsonGeometry`; select `merchant.geometry::text AS geometry_json` in `discoverMerchants`; query a temporary row type containing `geometry_json`; map each row through existing `parseGeometryText` exactly as `listStops`, `getStopDetail`, `getMerchantDetail`, and `getIsochrone` do. Require a valid Point and fail safely rather than emitting `[0,0]`, a snapped node, route endpoint, or invented coordinate. Preserve every existing predicate, stored walking field, order clause, errors, and analysis version. `api-contract.ts` needs no change. `api/discovery/route.ts` needs no behavioral change because it already returns `results` transparently; modify it only if implementation adds a narrowly necessary response assertion.
2. Install the frozen browser map dependencies only after approval: `leaflet`, `react-leaflet`, and `@types/leaflet` if Leaflet types are not bundled/resolved. Use npm exact-version installation and lockfile update; add no MapLibre, Redux, Zustand, React Query/TanStack Query, or map abstraction package.
3. Replace the starter page with a RUJAK shell. Use a `RujakWebGis` client controller and Next dynamic `ssr: false` boundary for a Leaflet component so `window` is never evaluated server-side.
4. Add browser-only types/fetch helpers aligned to actual response JSON. Calls are same-origin, retain structured API errors/status/request ID, validate Point/Polygon/MultiPolygon and media shape, accept `AbortSignal`, and never import server/database code.
5. Keep local reducer state limited to stop list/status, `selectedStopId`, selected stop detail/status, `walkingMinutes: 5|10`, `categoryL2`, discovery request/result/error, isochrone request/result/error, `selectedMerchantId`, selected merchant detail/status if needed, current request/revision identity, and map viewport/fit command. No bulk merchant-geometry cache/status exists.
6. On entry, request stops and fit the fixed study-area bounds once. After selection, request stop detail, matching isochrone, and discovery. Stop/threshold changes clear selected merchant and visibly clear stale result/isochrone state. Category changes rerun discovery only. Give each request an immutable key/revision; abort prior requests and accept only matching current responses, preventing stale data/errors from overwriting selection.
7. Render MAPID Light tiles only with the approved URL/key and MAPID/OpenMapTiles/OpenStreetMap attribution. Start implementation with configuration that is validated against actual MAPID 512 tiles; visually determine/retain the correct `tileSize: 512` and `zoomOffset: -1` combination only if required. Missing key creates an explicit map-unavailable/configuration state with no fallback.
8. Render layers bottom-to-top: MAPID base/attribution, translucent served isochrone, all stop markers, discovery merchant Point markers, selected states. Discovery result `merchant_id` supplies list row, Point marker, and selection identity. List click highlights exact marker; marker click selects exact result/detail; no name matching. Discovery remains reachability authority; isochrone is visualization only and no browser point-in-polygon check occurs.
9. Derive category choices from non-null `category_l2` values in successful backend discovery results, cache the unfiltered current stop/time choices so filtering does not erase options, and pass exact canonical category string or `null`. Do not expose `category_l1` or `category_l3` in P0.
10. Fetch `GET /api/merchants/:merchantId` only after merchant selection when further canonical detail is useful; do not fetch it to create markers. Reuse discovery walking values in detail. Show only supported name/category/address/walking fields (and real extra canonical detail when present), never price/rating/hours/menu.
11. Show raw stop evidence/media with a local-condition disclaimer; structured tags only if API returns approved review status. Validate `http`/`https` image URLs and use failure-safe image fallback so media cannot break map/discovery. Distinguish initial, stop-selected, discovery loading, isochrone loading, results, valid empty, merchant selected/detail loading, and structured API error. Reset aborts requests and returns deterministic stop-only initial state.

## 8. Files to Create / Modify

### A. Narrow backend compatibility patch

| Path | Exact change |
| --- | --- |
| `apps/web/src/lib/server/rujak-db.ts` | Extend `DiscoveryRow`; alter only `discoverMerchants` select/mapping to return canonical `culinary_poi.geometry` as parsed EPSG:4326 GeoJSON Point through `parseGeometryText`. Keep SQL joins, reachability/category filters, walking values, and order unchanged. |
| `apps/web/src/app/api/discovery/route.ts` | Expected no behavioral change: its existing `results` response automatically exposes additive row geometry. Touch only if a narrow response assertion is actually needed. |
| `apps/web/src/lib/server/api-contract.ts` | Expected no change: it has request/error, not response, contract types. |

### B. Frontend PHASE-06 implementation

| Path | Responsibility |
| --- | --- |
| `apps/web/package.json`, `apps/web/package-lock.json` | Exact pinned Leaflet/React Leaflet/type dependency additions only. |
| `apps/web/src/app/page.tsx`, `layout.tsx`, `globals.css` | RUJAK entry/metadata and responsive map-panel styling. |
| `apps/web/src/components/rujak/RujakWebGis.tsx` | Reducer, cancellation/revision, retry/reset, state wiring. |
| `apps/web/src/components/rujak/RujakMap.tsx` | Client-only Leaflet, MAPID Light tiles, attribution, panes, served GeoJSON, direct discovery markers, study-area/interaction viewport behavior. |
| `apps/web/src/components/rujak/DiscoveryControls.tsx` | Stop picker, fixed 5/10, actual `category_l2`, reset. |
| `apps/web/src/components/rujak/DiscoveryResults.tsx` | Result/loading/empty/error cards keyed by `merchant_id`. |
| `apps/web/src/components/rujak/MerchantDetail.tsx` | Selected canonical detail plus discovery walking facts. |
| `apps/web/src/components/rujak/TransitEvidence.tsx` | Review-aware evidence and safe media. |
| `apps/web/src/lib/client/rujak-api.ts`, `rujak-types.ts` | Browser-safe typed API/error/geometry handling. |
| `.env.example` | Add only `NEXT_PUBLIC_MAPID_MAPS_API_KEY=` placeholder and public-key safety/rotation comments. |

### C. Tests and verification

| Path | Responsibility |
| --- | --- |
| `apps/web/tests/api/discovery-route.test.ts` | Add geometry to normal expected discovery rows; preserve zero/error assertions. |
| `scripts/database/verify-phase05-import.mjs` | Add read-only pre/post compatibility parity checks for canonical Point geometry and unchanged analytical counts/order/values. |
| `apps/web/tests/api/verify-phase05-import.test.ts` | Extend verifier regression expectations for the new checks. |
| `apps/web/tests/api/discovery-geometry.test.ts` | Add API-level geometry/parity integration coverage using authorised runtime; no mock-only completion claim. |
| `apps/web/tests/frontend/rujak-api.test.ts`, `rujak-state.test.ts` | Client parser and reducer race/reset/ID/category state tests with labelled isolated fixtures. |
| `apps/web/tests/e2e/phase06-primary-flow.spec.ts` (conditional) | Only if low-cost/reliable real-service browser automation becomes practical. |

## 9. Data / DB Schema Impact

DB schema impact: none. Migration impact: none. Canonical culinary data impact: none. Spatial analytical output impact: none. `stop_merchant_access`, Dijkstra, snapping, eligibility, isochrones, walking distance/time, category filtering, ordering, and `analysis_version` impact: none.

The API reads the already canonical `rujak.culinary_poi.geometry` through existing server serialization. It neither creates a new location nor changes an analytical record.

## 10. Algorithms / Processing Details

No spatial algorithm runs in the frontend or changes upstream. Backend discovery keeps its relational join/stored boolean reachability filter/stored walking-time order. The additive geometry operation is server-side text geometry parsing already used by PHASE-05; it is not a PostGIS runtime serialization call.

Client processing is fixed selection, `category_l2` option extraction, request-key/revision cancellation, display-only rounding, geometry/media validation, and Leaflet rendering. Discovery determines reachable markers. Isochrones only visualize the approved network output.

## 11. API Contract Impact

`POST /api/discovery` receives one additive, backward-compatible field per normal result:

```json
{
  "merchant_id": "...",
  "merchant_name": "...",
  "category_l1": "...",
  "category_l2": "...",
  "category_l3": "...",
  "address": "...",
  "geometry": { "type": "Point", "coordinates": [112.74, -7.26] },
  "walking_distance_m": 612,
  "walking_time_min": 7.85
}
```

It is the canonical `culinary_poi.geometry`, EPSG:4326 GeoJSON Point, `[longitude, latitude]`, and merchant physical location. It is not a snap node, route endpoint, synthetic position, or isochrone-derived position. Existing input, zero-result, error, category, ordering, and analysis-version contracts remain unchanged. `GET /api/merchants/:merchantId` remains optional selected-detail API, not a marker API.

## 12. UI Impact

Initial state shows MAPID Light and all stops framed by fixed `study_area_p0` bounds, with no implied discovery. Selecting a `stop_id` highlights it and starts matching detail/discovery/isochrone requests. Network loading clears/marks an old catchment; discovery loading clears/marks old merchant results. Results render markers directly from the same `merchant_id`/Point rows used by cards. Merchant selection is bidirectional exact-ID synchronization. Valid 200 empty is distinct from all API failures; retry/reset are clear and deterministic.

Interaction-driven fit bounds is separate from initial view: a selected stop, matching isochrone/discovery markers, or selected merchant may move the map only when beneficial and without repeated/erratic auto-fit. The desktop-first layout keeps map, controls, results, evidence, and detail readable; narrow widths stack or collapse panels simply.

## 13. Tests and Validation

- Install/build/static: exact dependency install, normal npm integrity install, lint, Vitest including retained PHASE-05 API tests, TypeScript through configured build, and production build.
- Discovery geometry regressions: prove every normal result has valid GeoJSON Point; `[longitude, latitude]` order; exact match to `GET /api/merchants/:merchantId`; no `[0,0]`/invented geometry on malformed/missing canonical data; unchanged primary 5-min count, primary 10-min count, total counts, walking-time order, category-filtered membership except field addition, walking metres/minutes, 5-minute subset of 10-minute, zero-result contract, and structured errors. The later report must show before/after analytical parity evidence.
- Frontend tests: stop selection; 5/10 toggle; actual `category_l2`; direct marker creation; list/marker `merchant_id` synchronisation both directions; selected highlight/detail; backend walking facts; no price/rating/hours; pending-tag suppression; media failure; initial/loading/empty/error/reset; and stale-response cancellation/revision protection.
- Real API smoke: nine stops; Halte Simpang Dukuh; API-served 5/10 isochrones; discovery Points/count/order/values; selected merchant detail geometry parity.
- Mandatory manual browser QA: MAPID tiles visibly load with no generic fallback or 401/403/CORS/auth errors; attribution is present; Surabaya is geographically correct; 512 tile configuration produces correct scale/zoom; missing key is explicit unavailable map; study-area initial viewport; nine markers; all primary-flow states; fit behavior; laptop/desktop layout. Build/API/unit success alone does not prove map behavior.
- No E2E tool exists. Add browser automation only if implementation shows a small reliable real-service test is low cost; otherwise retain integration tests, real API smoke, and documented manual QA.

## 14. Commands Codex Plans to Run

No implementation command is run in this planning revision. After approval, from `apps/web`:

```powershell
npm install --save-exact leaflet react-leaflet
npm install --save-dev --save-exact @types/leaflet
npm ci
npm run lint
npm run test
npm run test:api
npm run build
npm run dev
```

The second install is conditional only on `@types/leaflet` not being bundled/resolved by the selected Leaflet version. Before release, securely load authorised variables without printing them and smoke real same-origin `/api/stops`, primary `/api/stops/:stopId/isochrones?minutes=5|10`, `POST /api/discovery`, and selected merchant detail. Validate MAPID in an actual browser with the endpoint/key; inspect tile requests, attribution, geographic location, scale, and no-fallback behavior.

## 15. Risks / Failure Modes

1. MAPID XYZ endpoint fails in browser, the rotated/new key cannot authorize tiles, or 401/403/CORS/tile-auth failure occurs.
2. Leaflet cannot render MAPID's 512 tiles correctly at Surabaya scale/zoom after visual validation of `tileSize`/`zoomOffset`.
3. Canonical discovery geometry is malformed/missing or cannot be added through existing parser without a breaking DB/schema/spatial change.
4. Geometry extension changes analytical result counts/order/walking values/category results/5-to-10 subset, violating parity.
5. Primary demo API is unavailable, IDs are lost, stale responses overwrite current selection, or frontend would need reachability computation.
6. Required tests fail in a way requiring architectural redesign.
7. Remote media fails or pending Access Quality is overclaimed; both must remain non-core and failure-safe.

There is no approved fallback for any MAPID failure.

## 16. Rollback / Recovery

The additive discovery field is backward-compatible; frontend versions that ignore it continue to consume the existing result fields. If deployed patch validation fails, revert only the application code deployment; no schema/data/spatial rollback is needed. Frontend retry/reset aborts work and restores stop-only initial state. A MAPID configuration failure presents explicit map-unavailable state and blocks completion rather than loading another basemap.

## 17. Open Questions

No unresolved design question currently blocks PHASE-06 implementation.

## 18. Definition of Done

Implementation is complete only with evidence that MAPID Light XYZ basemap actually renders with MAPID/OpenMapTiles/OpenStreetMap attribution and no generic fallback; all nine stops show within the P0 study-area initial viewport; Halte Simpang Dukuh complete non-AI flow works; served 5/10 isochrones display; discovery directly provides canonical merchant Point geometry and map markers are built from it; `category_l2` works; list/map use identical `merchant_id` and sync both directions; walking values remain backend facts; no unsupported price/rating/hours appear; pending Access Quality is not presented as approved; loading/empty/error/reset/stale states work; no happy path uses mocks, client routing/reachability, or N+1 geometry loading; no database/schema/spatial analytical/analysis-version change occurred; geometry parity/API regressions pass; and the full journey is repeatable on judge laptop/desktop.
