import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/lib/server/api-contract";

const mocks = vi.hoisted(() => ({
  discoverMerchants: vi.fn(),
  requireCompleteDiscoveryAccess: vi.fn(),
  requireRoutableStop: vi.fn(),
}));

vi.mock("@/lib/server/rujak-db", () => ({
  discoverMerchants: mocks.discoverMerchants,
  runtimeConfig: () => ({ analysisVersion: "p0-central-v1" }),
}));

vi.mock("@/lib/server/route-helpers", () => ({
  requireCompleteDiscoveryAccess: mocks.requireCompleteDiscoveryAccess,
  requireRoutableStop: mocks.requireRoutableStop,
}));

import { POST } from "../../src/app/api/discovery/route";

const stopId = "6a92c77152d86e03b51db962";

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/discovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PHASE-05 discovery API route", () => {
  beforeEach(() => {
    mocks.discoverMerchants.mockReset();
    mocks.requireCompleteDiscoveryAccess.mockReset().mockResolvedValue(undefined);
    mocks.requireRoutableStop.mockReset().mockResolvedValue({ stopName: "Halte Simpang Dukuh" });
  });

  it("returns the precomputed category-filtered results in walking-time order", async () => {
    const results = [
      { merchant_id: "merchant-near", merchant_name: "Near", category_l1: "ROTI", category_l2: null, category_l3: null, address: null, geometry: { type: "Point", coordinates: [112.74, -7.26] }, walking_distance_m: 120, walking_time_min: 1.5 },
      { merchant_id: "merchant-far", merchant_name: "Far", category_l1: "ROTI", category_l2: null, category_l3: null, address: null, geometry: { type: "Point", coordinates: [112.741, -7.261] }, walking_distance_m: 180, walking_time_min: 2.5 },
    ];
    mocks.discoverMerchants.mockResolvedValue(results);

    const response = await POST(request({ stop_id: stopId, max_walk_time: 5, category: "  roti  " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      stop: { stop_id: stopId, stop_name: "Halte Simpang Dukuh" },
      criteria: { max_walk_time: 5, category: "ROTI" },
      results,
      analysis_version: "p0-central-v1",
    });
    expect(mocks.discoverMerchants).toHaveBeenCalledWith(stopId, 5, "ROTI");
    expect(results.map((row) => row.walking_time_min)).toEqual([1.5, 2.5]);
    expect(results.every((row) => row.geometry.type === "Point")).toBe(true);
  });

  it("returns a valid empty result collection", async () => {
    mocks.discoverMerchants.mockResolvedValue([]);

    const response = await POST(request({ stop_id: stopId, max_walk_time: 10, category: "ROTI" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [], analysis_version: "p0-central-v1" });
  });

  it("returns the stable not-found error for a valid but absent stop", async () => {
    mocks.requireRoutableStop.mockRejectedValue(new ApiError(404, "STOP_NOT_FOUND", "The requested stop was not found."));

    const response = await POST(request({ stop_id: stopId, max_walk_time: 5, category: null }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "STOP_NOT_FOUND", message: "The requested stop was not found." } });
    expect(mocks.discoverMerchants).not.toHaveBeenCalled();
  });

  it("rejects an unsupported walking threshold before querying discovery data", async () => {
    const response = await POST(request({ stop_id: stopId, max_walk_time: 15, category: null }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNSUPPORTED_WALK_THRESHOLD" } });
    expect(mocks.requireRoutableStop).not.toHaveBeenCalled();
    expect(mocks.discoverMerchants).not.toHaveBeenCalled();
  });
});
