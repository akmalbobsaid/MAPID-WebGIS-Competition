import { describe, expect, it } from "vitest";

import { parseGeometryText } from "../../src/lib/server/geometry-wkt";

describe("PHASE-05 runtime geometry serialization", () => {
  it("serializes the Point EWKT returned by the populated stop table without PostGIS functions", () => {
    expect(parseGeometryText("SRID=4326;POINT(112.737 -7.25)")).toEqual({
      type: "Point",
      coordinates: [112.737, -7.25],
    });
  });

  it("serializes the hexadecimal EWKB text returned by PostGIS geometry output", () => {
    expect(parseGeometryText("0101000020e610000000000000000000000000000000000000")).toEqual({
      type: "Point",
      coordinates: [0, 0],
    });
  });

  it("serializes Polygon and MultiPolygon EWKT for isochrone API responses", () => {
    expect(parseGeometryText("POLYGON((0 0,1 0,1 1,0 0))")).toEqual({
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    });
    expect(parseGeometryText("MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((2 2,3 2,3 3,2 2)))")).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    });
  });
});
