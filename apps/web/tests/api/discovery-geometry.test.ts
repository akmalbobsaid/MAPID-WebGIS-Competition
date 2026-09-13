import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AnalyticalDataUnavailableError, parseDiscoveryRows } from "../../src/lib/server/rujak-db";

const row = {
  merchant_id: "009e8a6b-2213-5674-a8e5-0e615bf94818",
  merchant_name: "Canonical merchant",
  category_l1: "MAKANAN DAN MINUMAN",
  category_l2: "RESTORAN",
  category_l3: null,
  address: "Surabaya",
  walking_distance_m: 612,
  walking_time_min: 7.85,
};

describe("PHASE-06 discovery merchant geometry", () => {
  it("serializes the canonical merchant Point in longitude, latitude order", () => {
    const [result] = parseDiscoveryRows([{ ...row, geometry_json: "SRID=4326;POINT(112.7401 -7.2602)" }]);

    expect(result).toMatchObject({
      ...row,
      geometry: { type: "Point", coordinates: [112.7401, -7.2602] },
    });
  });

  it("rejects missing or non-Point canonical geometry instead of inventing a marker", () => {
    expect(() => parseDiscoveryRows([{ ...row, geometry_json: null }])).toThrow();
    expect(() => parseDiscoveryRows([{ ...row, geometry_json: "POLYGON((112 -7,113 -7,113 -6,112 -7))" }])).toThrow(AnalyticalDataUnavailableError);
  });
});
