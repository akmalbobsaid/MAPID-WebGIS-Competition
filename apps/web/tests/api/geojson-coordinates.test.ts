import { describe, expect, it } from "vitest";

import { geoJsonPointToLeafletLatLng, geographicBoundsToLeafletLatLngBounds } from "../../src/lib/client/geojson-coordinates";

describe("GeoJSON to Leaflet coordinate boundaries", () => {
  it("converts Halte Simpang Dukuh from GeoJSON longitude/latitude order", () => {
    expect(geoJsonPointToLeafletLatLng([112.7419137, -7.2630167])).toEqual([-7.2630167, 112.7419137]);
  });

  it("converts merchant coordinates to Leaflet latitude/longitude order", () => {
    expect(geoJsonPointToLeafletLatLng([112.742231, -7.262747])).toEqual([-7.262747, 112.742231]);
  });

  it("creates Leaflet study-area south-west and north-east bounds", () => {
    expect(geographicBoundsToLeafletLatLngBounds({
      west: 112.72841800864781,
      east: 112.75938099634507,
      south: -7.275481894144229,
      north: -7.248349086279674,
    })).toEqual([
      [-7.275481894144229, 112.72841800864781],
      [-7.248349086279674, 112.75938099634507],
    ]);
  });

  it("rejects GeoJSON points outside valid latitude or longitude ranges", () => {
    expect(() => geoJsonPointToLeafletLatLng([112.7419137, 90.1])).toThrow("Invalid GeoJSON Point coordinates");
    expect(() => geoJsonPointToLeafletLatLng([180.1, -7.2630167])).toThrow("Invalid GeoJSON Point coordinates");
  });
});
