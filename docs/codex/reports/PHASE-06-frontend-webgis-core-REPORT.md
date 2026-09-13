# PHASE-06 Implementation Report

## 1. Status

**PASS**

Manual real-browser acceptance is complete. The MAPID Light vector basemap, Leaflet overlays, discovery interaction, state handling, layout resizing, and console/network behavior passed all required PHASE-06 QA points after the worker-delivery, layout-resize, and coordinate-order fixes. No PHASE-07 work was started.

## 2. Scope Implemented

- Replaced only the failed MAPID XYZ raster layer with the MAPID Light GL style through the official `@maplibre/maplibre-gl-leaflet` adapter.
- Removed the raster `TileLayer` and its `tileSize={512}` / `zoomOffset={-1}` configuration.
- Added a small client-only `MapidVectorBasemap` React Leaflet child. It gets the existing Leaflet instance with `useMap`, creates the adapter layer after the client module loads, and removes it during unmount cleanup.
- Added a package-resolved worker-copy script that copies both MapLibre GL v6 worker modules into `public/maplibre/` before normal development and production-build workflows.
- Configured `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")` after importing MapLibre GL and before importing/creating the MapLibre Leaflet layer.
- Constrained the desktop map/result grid to one viewport-based row and kept sidebar growth inside its scroll container, so result/evidence content cannot stretch the map panel.
- Added a `ResizeObserver`-based React Leaflet controller that schedules `map.invalidateSize({ pan: false, animate: false })` after real container size changes and resizes the underlying MapLibre map through the adapter layer ref.
- Added explicit validated GeoJSON `[lng, lat]` to Leaflet `[lat, lng]` helpers and applied them to marker positions, CircleMarker centers, selected focus `flyTo`, and study-area bounds. GeoJSON isochrone data remains unmodified.
- Kept React Leaflet markers, GeoJSON isochrones, map event handlers, viewport fitting/focus, reducer state, and canonical `stop_id` / `merchant_id` interactions unchanged.
- Retained the deliberate no-fallback policy. Missing MAPID configuration still shows the explicit map-unavailable message rather than a generic basemap.
- Retained the approved additive PHASE-06 discovery Point geometry response used for direct merchant markers; no API, database schema, or spatial-analysis behavior was changed for the vector-basemap deviation.

## 3. Failed Raster Evidence and Approved Deviation

The approved MAPID raster validation established the following before this implementation change:

- MAPID Light XYZ raster endpoint: HTTP 404.
- MAPID raster TileJSON endpoint: HTTP 404.
- MAPID Light Raster viewer: no basemap rendered.
- MAPID Street Mapid Raster viewer: no basemap rendered.
- MAPID Light GL Style endpoint: works.
- MAPID Light Vector viewer: renders correctly.

Because the approved raster service is unavailable independently of RUJAK, continuing to use Leaflet's raster `TileLayer` would make the WebGIS unusable. The limited approved deviation is therefore necessary: render the already-working MAPID Light vector style in Leaflet through MAPID-compatible MapLibre GL tooling. This is not a migration away from Leaflet or React Leaflet.

## 4. Files Added

- `apps/web/src/components/rujak/DiscoveryControls.tsx`
- `apps/web/src/components/rujak/DiscoveryResults.tsx`
- `apps/web/src/components/rujak/MerchantDetail.tsx`
- `apps/web/src/components/rujak/RujakMap.tsx`
- `apps/web/src/components/rujak/RujakWebGis.tsx`
- `apps/web/src/components/rujak/TransitEvidence.tsx`
- `apps/web/src/lib/client/rujak-api.ts`
- `apps/web/src/lib/client/rujak-types.ts`
- `apps/web/tests/api/discovery-geometry.test.ts`
- `apps/web/scripts/copy-maplibre-worker.mjs`
- `apps/web/src/lib/client/geojson-coordinates.ts`
- `apps/web/tests/api/geojson-coordinates.test.ts`

## 5. Files Modified

- `.env.example`
- `apps/web/package.json`, `apps/web/package-lock.json`
- `apps/web/eslint.config.mjs`, `.gitignore`
- `apps/web/src/app/page.tsx`, `layout.tsx`, `globals.css`
- `apps/web/src/lib/server/rujak-db.ts`
- `apps/web/tests/api/discovery-route.test.ts`
- `apps/web/tests/api/verify-phase05-import.test.ts`
- `scripts/database/verify-phase05-import.mjs`
- this report

`git` is not installed/on `PATH` in this execution environment, so `git status` and `git diff --stat` could not be collected. The lists above are the inspected equivalent. No key or database credential was printed or added to tracked files.

## 6. Dependencies

Exact versions were selected after checking the current package metadata and the adapter peer-dependency compatibility with Leaflet `1.9.4`:

- `maplibre-gl` `6.9.0`
- `@maplibre/maplibre-gl-leaflet` `0.1.4`

The adapter declares compatibility with Leaflet `^1.9.3` and MapLibre GL `^2.4`, `^3.3.1`, `^4.3.2`, `^5`, and `^6`. `maplibre-gl/dist/maplibre-gl.css` is imported by `globals.css`.

## 7. Map Architecture and Lifecycle

- `MapContainer` remains the Leaflet map controller.
- React Leaflet remains responsible for the map lifecycle, stop `Marker`s, merchant `CircleMarker`s, isochrone `GeoJSON`, and `ViewportController` fit/focus behavior.
- `MapidVectorBasemap` is a child of that same `MapContainer`; it only attaches/removes the MapLibre Leaflet layer.
- Its client-only initialization order is: import `maplibre-gl`; call `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")`; import the official Leaflet adapter; create the adapter layer. This happens before the underlying MapLibre map exists.
- `scripts/copy-maplibre-worker.mjs` resolves `maplibre-gl/package.json`, derives its installed `dist` directory, and copies both `maplibre-gl-worker.mjs` and its relative dependency `maplibre-gl-shared.mjs` into `public/maplibre/`. `predev` and `prebuild` run the script, so generated files match the pinned installed package in local development, CI, and deployment builds.
- The MapLibre layer is created with `interactive: false`, and its canvas is non-interactive in CSS. Leaflet owns map gestures and existing marker/overlay event handlers remain above the `tilePane` basemap.
- `MapResizeController` observes the existing Leaflet container, coalesces changes with `requestAnimationFrame`, invalidates Leaflet without panning or viewport refitting, then calls `getMaplibreMap().resize()` when the persistent adapter layer is available. The observer and pending frame are cleaned up on unmount.
- The resize controller performs no center, camera, `setCenter`, `jumpTo`, `easeTo`, or `flyTo` synchronization. It only invalidates Leaflet size and asks the existing MapLibre map to resize.
- `RujakMap`, `MapContainer`, and `MapidVectorBasemap` have no state-dependent React key or conditional mount. The basemap effect depends only on the Leaflet map, MAPID key, and stable layer-handoff callback—not selected stop, walking minutes, category, discovery results, merchant selection, or isochrone state.
- `geoJsonPointToLeafletLatLng` validates coordinates and converts only at Leaflet positional API boundaries. `geographicBoundsToLeafletLatLngBounds` creates Leaflet south-west/north-east pairs from west/east/south/north. MapLibre and React Leaflet `GeoJSON` continue to receive GeoJSON `[lng, lat]` as-is.
- Adapter custom attribution is `MAPID Maps · OpenMapTiles · © OpenStreetMap contributors`; no generic fallback layer exists.
- The public `NEXT_PUBLIC_MAPID_MAPS_API_KEY` remains the only MAPID configuration input. It is interpolated only in the client style request and was not hard-coded or printed.

## 8. API / Data / Spatial Changes

- The prior PHASE-06 additive `POST /api/discovery` Point geometry response remains intact for direct result-marker placement. It reads canonical `culinary_poi.geometry` and rejects absent/non-Point geometry instead of synthesizing coordinates.
- No database migration, canonical data, reachability output, `stop_merchant_access`, Dijkstra, snapping, isochrone, category, walking-time, or analysis-version behavior changed for the basemap deviation.

## 9. Tests Run

Completed successfully from `apps/web`:

```powershell
npm run lint
npm run test
npm run test:api
npm run build
```

Results:

- ESLint: **PASS**, zero errors/warnings.
- `npm run test`: **PASS**, 9 test files and 27 tests.
- `npm run test:api`: **PASS**, 9 test files and 27 tests.
- Production build: **PASS**. `prebuild` first printed `Prepared matching MapLibre worker assets.`; Next then compiled, type-checked, and generated `/` plus all API routes.

## 10. Runtime and MAPID Resource Validation

The local development app was reachable at `http://127.0.0.1:3000/` using existing ignored environment configuration. No secret values were displayed.

| Check | Result |
| --- | --- |
| MAPID Light GL style | HTTP 200; style version 8; one vector source |
| MAPID source TileJSON | HTTP 200 |
| Referenced vector tile | HTTP 200 |
| Sprite JSON | HTTP 200 |
| Glyph range | HTTP 200 |
| CORS for style, TileJSON, vector tile, sprite, glyph | `Access-Control-Allow-Origin: *` on each |
| Local worker module | `GET /maplibre/maplibre-gl-worker.mjs`: HTTP 200, `application/javascript; charset=UTF-8` |
| Local shared module | `GET /maplibre/maplibre-gl-shared.mjs`: HTTP 200, `application/javascript; charset=UTF-8` |
| Worker sibling import | Present: `from "./maplibre-gl-shared.mjs"`; both files are served from the same directory |
| `GET /api/stops` | HTTP 200; 9 stops |
| Halte Simpang Dukuh detail | HTTP 200 |
| Halte Simpang Dukuh 5-minute isochrone | HTTP 200 |
| Halte Simpang Dukuh 10-minute isochrone | HTTP 200 |
| 5-minute merchant discovery | HTTP 200; 26 Point-marker results |
| 10-minute merchant discovery | HTTP 200; 94 Point-marker results |
| Merchant detail round trip | HTTP 200; returned `merchant_id` equals the selected result ID |
| Runtime analysis version | `p0-central-v1` |

These checks establish that the configured vector style and its browser resources are available without 401/403/404 responses and expose permissive CORS headers. Crucially, the local worker and its sibling shared module no longer resolve to HTML; both have JavaScript-compatible MIME types. They are transport/runtime checks, not a substitute for an actual rendered-browser inspection.

## 11. Browser Validation and Screenshots

Manual real-browser acceptance completed with all required QA points passing:

- **Initial state:** MAPID Light vector basemap rendered at the correct P0 Central Surabaya viewport; all nine canonical transit markers and MAPID / OpenMapTiles / OpenStreetMap attribution were visible.
- **MAPID/runtime:** Style, source, and vector-tile requests succeeded with browser Network 200/304 responses. No blocking 401/403/404/CORS failure, MapLibre worker MIME/module failure, or generic fallback layer was present.
- **Primary demo:** Halte Simpang Dukuh selection worked; 5-minute discovery returned 26 merchants and 10-minute discovery returned 94. Both served isochrones rendered, and the MAPID basemap stayed rendered through discovery/layout changes.
- **Discovery/filtering:** `category_l2` filtering used actual backend categories; merchant markers rendered directly from discovery Point geometry; list and map represented the same discovery state.
- **Canonical synchronization:** Clicking a result selected/highlighted the matching merchant marker by `merchant_id`; clicking a merchant marker focused the matching result/detail by the same canonical ID. Displayed walking distance and walking time were backend values.
- **State/layout:** Reset restored the correct initial state; loading, empty, and error handling were exercised; rapid state/layout updates left no stale map content; browser resizing produced no gray/blank gaps; the desktop/laptop judge layout remained usable.
- **Console:** No critical RUJAK, Leaflet, or MapLibre runtime error remained.

No manual browser screenshots/artifacts were supplied or found locally in this workspace. The completed manual QA observations above are the reviewable acceptance evidence for this run.

## 12. Data Quality / Spatial Validation

Automated coverage verifies discovery geometry is a canonical longitude/latitude GeoJSON Point and rejects missing/non-Point geometry without a fallback coordinate. New client conversion tests verify Simpang Dukuh and merchant positions are converted to Leaflet latitude/longitude order, study bounds use Leaflet south-west/north-east order, and out-of-range latitude/longitude values fail explicitly. The API runtime confirms the live nine-stop response, Halte Simpang Dukuh selection source, both served isochrones, and the expected primary discovery counts of 26 at 5 minutes and 94 at 10 minutes.

The result-marker data contain 94 Point geometries for the 10-minute query. A merchant detail request using one returned canonical ID round-tripped to the same `merchant_id`, supporting the existing list/marker selection contract. Manual browser QA confirmed the same canonical-ID synchronization in both list-to-marker and marker-to-detail directions.

## 13. Known Limitations

- MAPID style processing may emit non-blocking missing-style-image warnings for `brownfield`, `gate`, and `lift_gate`. They do not prevent basemap rendering, Leaflet overlays, or RUJAK interaction and are not an acceptance failure.
- No E2E browser framework or browser screenshot artifact was added; manual browser acceptance is recorded in Section 11.
- `npm install` reported two existing dependency-audit findings (one moderate, one critical). They were not changed as part of this narrowly scoped basemap implementation.

## 14. Reproduction Commands

```powershell
Push-Location apps/web
npm ci
npm run lint
npm run test
npm run test:api
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3000
```

`npm run dev` runs `predev`; `npm run build` runs `prebuild`. The Section 11 browser acceptance sequence was completed manually. Repeat it in an ordinary browser with the approved existing `NEXT_PUBLIC_MAPID_MAPS_API_KEY` in ignored/deployed configuration for any subsequent release validation. Do not print or place the key in source control.

## 15. Environment / Configuration Changes

- `.env.example` documents a blank `NEXT_PUBLIC_MAPID_MAPS_API_KEY` only.
- The implementation preserves that variable name and consumes it in the MAPID Light GL style URL.
- `apps/web/.env.local` was created/updated locally for ignored development-only MAPID and server runtime configuration. It is not intended for source control and no credential value is recorded in this report.
- No deployment environment, database URL, password, or credential value is recorded in this report.

## 16. Security Notes

- No API key was hard-coded, logged, printed, or committed by this work.
- The key is intentionally public-by-design only for the MAPID browser map contract and should be dedicated to RUJAK and restricted by domain/referrer where MAPID supports it.
- Database configuration remains server-only.
- Before release, run Git status/diff and repository secret scanning in an environment with Git available.

## 17. Definition of Done Evidence

| Requirement | Evidence / result |
| --- | --- |
| Official vector adapter and CSS | Implemented with pinned `maplibre-gl` and `@maplibre/maplibre-gl-leaflet`; build passes. |
| Leaflet/React Leaflet remain primary | Code inspection: same `MapContainer`, overlays, marker events, and viewport controller; MapLibre is basemap-only. |
| Raster layer and raster zoom logic removed | `RujakMap.tsx` contains no `TileLayer`, `tileSize`, or `zoomOffset`. |
| No fallback; attribution preserved | Code inspection: explicit missing-config state; adapter attribution names MAPID Maps, OpenMapTiles, and OpenStreetMap. |
| Style/source/tile/sprite/glyph availability | HTTP 200 and CORS `*` validation, Section 10. |
| MapLibre v6 worker delivery | Worker and shared module are package-resolved/copied, served at HTTP 200 as JavaScript, and retain their relative import, Section 10. |
| Post-discovery layout containment | Desktop grid has a bounded `minmax(0, 1fr)` row; sidebar scrolls internally and cannot stretch the map row. |
| Leaflet/MapLibre resize synchronization | Persistent ResizeObserver controller invalidates Leaflet without pan/refit and resizes the adapter's MapLibre map. |
| GeoJSON-to-Leaflet boundary | Explicit helper converts `[lng, lat]` to `[lat, lng]` for markers, CircleMarkers, focus `flyTo`, and study bounds; 4 targeted regression tests pass. |
| 9 stops, Simpang Dukuh, 5/10, 26/94 | Local runtime/API validation, Section 10. |
| Merchant ID data round trip | Local runtime/API validation, Section 10. |
| Browser rendering and MAPID/runtime | **PASS**: manual browser QA confirmed basemap, P0 Central Surabaya viewport, nine stops, attribution, successful MAPID requests, no blocking provider/CORS/worker errors, and no fallback layer. |
| Discovery, canonical interaction, and state/layout | **PASS**: Simpang Dukuh 26/94 flow, served isochrones, category filtering, direct Point markers, two-way `merchant_id` synchronization, reset/loading/empty/error behavior, rapid updates, and browser resizing all passed. |
| Browser screenshots/artifacts | No manual screenshot artifact was supplied or found locally; manual QA evidence is recorded in Section 11. |

## 18. Readiness for Next Phase

**PHASE-06 is ready for review for GO NEXT.** Browser acceptance, automated validation, live runtime checks, worker delivery, resize synchronization, and GeoJSON-to-Leaflet coordinate conversion evidence are complete. Do not start PHASE-07 until that review explicitly approves GO NEXT.
