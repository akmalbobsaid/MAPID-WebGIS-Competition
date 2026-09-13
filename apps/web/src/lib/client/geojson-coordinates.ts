import type { Position } from "@/lib/client/rujak-types";

export type LeafletLatLng = [number, number];

function assertValidGeoJsonPoint([lng, lat]: Position) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error("Invalid GeoJSON Point coordinates");
  }
}

export function geoJsonPointToLeafletLatLng(coordinates: Position): LeafletLatLng {
  assertValidGeoJsonPoint(coordinates);
  const [lng, lat] = coordinates;
  return [lat, lng];
}

export function geographicBoundsToLeafletLatLngBounds({
  west,
  east,
  south,
  north,
}: {
  west: number;
  east: number;
  south: number;
  north: number;
}): [LeafletLatLng, LeafletLatLng] {
  assertValidGeoJsonPoint([west, south]);
  assertValidGeoJsonPoint([east, north]);
  if (west > east || south > north) throw new Error("Invalid geographic bounds");
  return [[south, west], [north, east]];
}
