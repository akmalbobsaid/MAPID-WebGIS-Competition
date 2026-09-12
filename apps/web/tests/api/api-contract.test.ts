import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  normalizeCategory,
  parseDiscoveryRequest,
  parseDuration,
  parseMerchantId,
  parseStopId,
  withApiRoute,
} from "../../src/lib/server/api-contract";

describe("P0 API validation contract", () => {
  it("accepts canonical stop and merchant identifiers", () => {
    expect(parseStopId("6a92c77152d86e03b51db962")).toBe("6a92c77152d86e03b51db962");
    expect(parseMerchantId("009e8a6b-2213-5674-a8e5-0e615bf94818")).toBe("009e8a6b-2213-5674-a8e5-0e615bf94818");
  });

  it("rejects malformed canonical identifiers", () => {
    expect(() => parseStopId("Halte Simpang Dukuh")).toThrow(ApiError);
    expect(() => parseMerchantId("merchant-1")).toThrow(ApiError);
  });

  it("limits P0 durations to five and ten minutes", () => {
    expect(parseDuration("5")).toBe(5);
    expect(parseDuration("10")).toBe(10);
    expect(() => parseDuration("15")).toThrow(ApiError);
  });

  it("normalizes canonical category matching without creating a taxonomy", () => {
    expect(normalizeCategory("  restoran\n  nusantara ")).toBe("RESTORAN NUSANTARA");
  });

  it("accepts a valid precomputed discovery request", async () => {
    const request = new Request("http://localhost/api/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stop_id: "6a92c77152d86e03b51db962",
        max_walk_time: 10,
        category: "roti",
      }),
    });
    await expect(parseDiscoveryRequest(request)).resolves.toEqual({
      stopId: "6a92c77152d86e03b51db962",
      maxWalkTime: 10,
      category: "ROTI",
    });
  });

  it("rejects unsupported thresholds and extra discovery fields", async () => {
    const unsupported = new Request("http://localhost/api/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stop_id: "6a92c77152d86e03b51db962", max_walk_time: 15, category: null }),
    });
    await expect(parseDiscoveryRequest(unsupported)).rejects.toMatchObject({ code: "UNSUPPORTED_WALK_THRESHOLD" });

    const extraField = new Request("http://localhost/api/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stop_id: "6a92c77152d86e03b51db962", max_walk_time: 5, category: null, rating: 5 }),
    });
    await expect(parseDiscoveryRequest(extraField)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("logs safe development database diagnostics while keeping the API error generic", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = Object.assign(new Error("database operation failed"), {
      operation: "list stops",
      cause: { code: "42501", message: "permission denied for schema extensions" },
    });
    const response = await withApiRoute(new Request("http://localhost/api/stops"), "GET /api/stops", {}, async () => {
      throw error;
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERNAL_ERROR", message: "The server could not complete the request." } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"operation":"list stops"'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"pgCode":"42501"'));
    log.mockRestore();
  });
});
