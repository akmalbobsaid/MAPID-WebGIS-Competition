import { describe, expect, it } from "vitest";

import { validateAgusActionStageOne, validateAgusActionStageTwo } from "../../src/lib/client/agus-map-action";

const stopId = "6a92c77152d86e03b51db962";
const merchantId = "009e8a6b-2213-5674-a8e5-0e615bf94818";
const action = { type: "discovery_result" as const, stop_id: stopId, minutes: 5 as const, category_l2: null, merchant_ids: [merchantId], highlight_merchant_id: merchantId, show_isochrone: true as const, fit_bounds: true as const };
const stops = [{ stop_id: stopId, stop_name: "Halte", geometry: { type: "Point" as const, coordinates: [112.74, -7.26] as [number, number] }, source: "source", validation_status: "valid", scope: "p0" }];

describe("AGUS staged map actions", () => {
  it("accepts local schema/context before remote discovery membership exists", () => {
    expect(validateAgusActionStageOne(action, stops)).toEqual(action);
  });

  it("requires matching authoritative discovery before highlight/final fit", () => {
    const discovery = { stop: { stop_id: stopId, stop_name: "Halte" }, criteria: { max_walk_time: 5 as const, category: null }, results: [{ merchant_id: merchantId }], analysis_version: "p0-central-v1" } as never;
    expect(validateAgusActionStageTwo(action, discovery)).toBe(true);
    expect(validateAgusActionStageTwo({ ...action, merchant_ids: ["009e8a6b-2213-5674-a8e5-0e615bf94819"] }, discovery)).toBe(false);
  });

  it("rejects malformed or noncanonical stage-one actions without changing state", () => {
    expect(validateAgusActionStageOne({ ...action, stop_id: "not-a-stop" }, stops)).toBeNull();
    expect(validateAgusActionStageOne({ ...action, merchant_ids: [merchantId, merchantId] }, stops)).toBeNull();
  });
});
