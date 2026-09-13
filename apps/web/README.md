# RUJAK web application

This is the Next.js application for the RUJAK P0 WebGIS. It contains the browser UI and same-origin API route handlers; canonical P0 data is served from the configured Supabase/PostGIS runtime database.

## Commands

```powershell
npm ci
npm run dev
npm run lint
npm run test
npm run test:api
npm run build
npm run start
```

`predev` and `prebuild` copy the required MapLibre worker into `public/maplibre/`; do not remove it. A deployed app must serve `/maplibre/maplibre-gl-worker.mjs`.

## Configuration

Use `apps/web/.env.local` for local values and the project environment settings for deployment. See the repository [.env.example](../../.env.example) for the exact variable names and handling rules. Never place database URLs, passwords, or `GEMINI_API_KEY` in browser code or version control. The `NEXT_PUBLIC_MAPID_MAPS_API_KEY` is browser-visible by design and must be limited to the authorized domain/referrer.

Vercel deployments must build this directory as the project Root Directory (or an equivalent configuration that builds this same application).
