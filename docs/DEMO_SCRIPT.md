# RUJAK P0 demo script

Use this script only against the authorized deployed RUJAK URL. It demonstrates the frozen canonical P0 scenario without claiming live routing or unavailable merchant attributes.

## Before presenting

1. Confirm the deployed app opens and `/maplibre/maplibre-gl-worker.mjs` returns successfully.
2. Confirm the MAPID basemap is visible. If it is not, show the explicit MAPID configuration/load state; do not substitute another basemap.
3. Use a desktop viewport and ensure the network/API and browser console have no critical errors.

## Canonical scenario

1. Open the public RUJAK URL. State that the scope is nine transit stops in Central Surabaya and that P0 uses precomputed walking-network access.
2. Select **Halte Simpang Dukuh** (`6a92c77152d86e03b51db962`). Confirm the selected stop and its 5-minute network catchment appear.
3. Switch to **10 minutes**. Confirm the catchment and discovery results expand. The canonical expected counts are 26 at 5 minutes and 94 at 10 minutes.
4. Choose a category that appears in the unfiltered 10-minute results. Confirm the map points, result count, and list stay synchronized.
5. Select one listed merchant. Point out its displayed walking distance and walking time, and explain that these values come from the precomputed walking network rather than a radius.
6. Show the stop’s approved local survey evidence. Clarify that it describes the stop/immediate surroundings, not the full walking corridor.
7. Ask AGUS a supported question about nearby canonical results, then use its map action. Confirm the normal discovery flow refreshes and highlights the returned canonical merchant(s).
8. Explain that normal stop selection, catchments, filters, details, and evidence remain usable if AGUS is unavailable.

## Closing statement

RUJAK supports an initial culinary-access decision from a selected transit stop. It does not provide price, rating, opening-hour information, real-time transit, or turn-by-turn navigation. See [limitations](LIMITATIONS.md).
