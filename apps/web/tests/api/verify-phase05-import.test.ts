import { describe, expect, it, vi } from "vitest";

import { verifyPhase05Import } from "../../../../scripts/database/verify-phase05-import.mjs";

const version = "p0-central-v1";
const tables = ["transit_points", "culinary_poi", "stop_snaps", "merchant_snaps", "stop_merchant_access", "stop_isochrones", "access_quality"];
const expectedDiscovery = {
  five: [{ merchant_id: "00000000-0000-4000-8000-000000000001", walking_distance_m: 130, walking_time_seconds: 100, walking_time_min: 100 / 60, geometry_text: "SRID=4326;POINT(112.74 -7.26)" }],
  ten: [
    { merchant_id: "00000000-0000-4000-8000-000000000001", walking_distance_m: 130, walking_time_seconds: 100, walking_time_min: 100 / 60, geometry_text: "SRID=4326;POINT(112.74 -7.26)" },
    { merchant_id: "00000000-0000-4000-8000-000000000002", walking_distance_m: 260, walking_time_seconds: 200, walking_time_min: 200 / 60, geometry_text: "SRID=4326;POINT(112.75 -7.25)" },
  ],
};

function readOnly(sql: string) {
  const statement = sql.replace(/^\s*\/\*[\s\S]*?\*\//, "").trimStart();
  return statement.startsWith("SELECT") || statement.startsWith("WITH");
}

describe("PHASE-05 post-import verification", () => {
  it("compares imported P0 facts and discovery against the canonical source without mutations", async () => {
    const queries: string[] = [];
    const adminClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("phase05-import: counts")) return { rows: [{ transit_points: "9", culinary_poi: "355", stop_snaps: "9", merchant_snaps: "355", stop_merchant_access: "3195", stop_isochrones: "18", access_quality: "9" }], rowCount: 1 };
        if (sql.includes("phase05-import: uniqueness")) return { rows: [{ unique_stops: "9", unique_merchants: "355", duplicate_stop_snaps: "0", duplicate_merchant_snaps: "0", duplicate_access: "0", duplicate_isochrones: "0" }], rowCount: 1 };
        if (sql.includes("phase05-import: versions")) return { rows: ["stop_snaps", "merchant_snaps", "stop_merchant_access", "stop_isochrones"].map((table_name) => ({ table_name, versions: [version] })), rowCount: 4 };
        if (sql.includes("phase05-import: integrity")) return { rows: ["stop_snaps", "merchant_snaps", "stop_merchant_access_stop", "stop_merchant_access_merchant", "stop_isochrones"].map((relation) => ({ relation, invalid_count: "0" })), rowCount: 5 };
        if (sql.includes("phase05-import: access invariants")) return { rows: [{ invalid_count: "0" }], rowCount: 1 };
        if (sql.includes("phase05-import: isochrones")) return { rows: Array.from({ length: 9 }, (_, index) => ({ stop_id: `stop-${index}`, row_count: "2", durations: [5, 10], valid_geometry: true })), rowCount: 9 };
        if (sql.includes("phase05-import: primary stop")) return { rows: [{ canonical_stop: true, stop_snaps: "1", access_rows: "355", isochrones: "2" }], rowCount: 1 };
        if (sql.includes("phase05-import: unsupported culinary fields")) return { rows: [], rowCount: 0 };
        throw new Error(`Unexpected admin query: ${sql}`);
      }),
      release: vi.fn(),
    };
    const runtimeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("phase05-import: runtime privileges")) return {
          rows: tables.map((table_name) => ({ runtime_role: "rujak_runtime", table_name, schema_usage: true, schema_create: false, can_select: true, can_insert: false, can_update: false, can_delete: false })),
          rowCount: tables.length,
        };
        if (sql.includes("phase05-import: runtime populated selects")) return { rows: [{}], rowCount: 1 };
        if (sql.includes("phase05-import: runtime discovery 5")) return { rows: expectedDiscovery.five, rowCount: expectedDiscovery.five.length };
        if (sql.includes("phase05-import: runtime discovery 10")) return { rows: expectedDiscovery.ten, rowCount: expectedDiscovery.ten.length };
        throw new Error(`Unexpected runtime query: ${sql}`);
      }),
      release: vi.fn(),
    };
    const adminPool = { connect: vi.fn(async () => adminClient), end: vi.fn(async () => undefined) };
    const runtimePool = { connect: vi.fn(async () => runtimeClient), end: vi.fn(async () => undefined) };
    const pools = [adminPool, runtimePool];
    class FakePool {
      constructor() {
        const nextPool = pools.shift();
        if (!nextPool) throw new Error("Unexpected pool construction.");
        return nextPool as unknown as FakePool;
      }
    }

    const summary = await verifyPhase05Import({
      adminConnectionString: "postgresql://admin@localhost/postgres?sslmode=verify-full",
      runtimeConnectionString: "postgresql://runtime@localhost/postgres?sslmode=verify-full",
      analysisVersion: version,
      postgisSchema: "gis",
      expectedDiscovery,
      PoolConstructor: FakePool,
    });

    expect(summary).toMatchObject({ analysis_version: version, primary_stop_id: "6a92c77152d86e03b51db962", discovery: { reachable_5min: 1, reachable_10min: 2 } });
    expect(queries.every(readOnly)).toBe(true);
    expect(adminClient.release).toHaveBeenCalledOnce();
    expect(runtimeClient.release).toHaveBeenCalledOnce();
    expect(adminPool.end).toHaveBeenCalledOnce();
    expect(runtimePool.end).toHaveBeenCalledOnce();
  });
});
