import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { AGUS_ACTION_TIMEOUT_MS, initialState, reducer } from "../../src/components/rujak/RujakWebGis";

const stopId = "6a92c77152d86e03b51db962";
const merchantId = "009e8a6b-2213-5674-a8e5-0e615bf94818";
const action = {
  type: "discovery_result" as const,
  stop_id: stopId,
  minutes: 5 as const,
  category_l2: null,
  merchant_ids: [merchantId],
  highlight_merchant_id: merchantId,
  show_isochrone: true as const,
  fit_bounds: true as const,
};

describe("AGUS staged action lifecycle", () => {
  it("forces a new discovery effect for an action whose criteria already match the current controls", () => {
    const current = {
      ...initialState,
      selectedStopId: stopId,
      minutes: 5 as const,
      categoryL2: null,
      discovery: { status: "success" as const, data: null, error: null },
      retryVersion: 4,
    };
    const applied = reducer(current, { type: "APPLY_AGUS_ACTION", action });
    expect(applied.pendingAgusAction).toBe(action);
    expect(applied.retryVersion).toBe(5);
    expect(applied.discovery.status).toBe("idle");
  });

  it("turns an unsettled AGUS discovery into a recoverable error instead of leaving it loading", () => {
    const applied = reducer({ ...initialState, selectedStopId: stopId }, { type: "APPLY_AGUS_ACTION", action });
    const loading = reducer(applied, { type: "REQUEST_START" });
    const timedOut = reducer(loading, { type: "AGUS_ACTION_TIMEOUT", action });
    expect(AGUS_ACTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(timedOut.pendingAgusAction).toBeNull();
    expect(timedOut.agusActionError).toContain("terlalu lama");
    expect(timedOut.discovery).toMatchObject({ status: "error" });
  });

  it("allows stage two to complete while the independent isochrone request is still loading", () => {
    const applied = reducer({ ...initialState, selectedStopId: stopId }, { type: "APPLY_AGUS_ACTION", action });
    const loading = reducer(applied, { type: "REQUEST_START" });
    const discoveryReady = reducer(loading, { type: "DISCOVERY", resource: { status: "success", data: null, error: null }, unfiltered: null });
    const committed = reducer(discoveryReady, { type: "AGUS_ACTION_COMMIT", action });
    expect(committed.pendingAgusAction).toBeNull();
    expect(committed.selectedMerchantId).toBe(merchantId);
    expect(committed.isochrone.status).toBe("loading");
  });

  it("does not let an old timeout overwrite a later completed action", () => {
    const applied = reducer({ ...initialState, selectedStopId: stopId }, { type: "APPLY_AGUS_ACTION", action });
    const committed = reducer(applied, { type: "AGUS_ACTION_COMMIT", action });
    expect(reducer(committed, { type: "AGUS_ACTION_TIMEOUT", action })).toBe(committed);
  });

  it("retries the stop list without re-running an in-progress discovery", () => {
    const current = { ...initialState, retryVersion: 3, stopsRetryVersion: 2 };
    const retried = reducer(current, { type: "RETRY_STOPS" });
    expect(retried.stopsRetryVersion).toBe(3);
    expect(retried.retryVersion).toBe(3);
  });
});
