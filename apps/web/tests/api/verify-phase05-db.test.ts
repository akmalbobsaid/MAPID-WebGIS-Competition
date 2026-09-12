import { describe, expect, it, vi } from "vitest";

import { sameColumns, verifyPhase05Database } from "../../../../scripts/database/verify-phase05-db.mjs";

const tables = ["transit_points", "culinary_poi", "stop_snaps", "merchant_snaps", "stop_merchant_access", "stop_isochrones", "access_quality"];
const primaryKeys = [
  ["transit_points", ["stop_id"]], ["culinary_poi", ["merchant_id"]], ["stop_snaps", ["stop_id", "analysis_version"]],
  ["merchant_snaps", ["merchant_id", "analysis_version"]], ["stop_merchant_access", ["stop_id", "merchant_id", "analysis_version"]],
  ["stop_isochrones", ["stop_id", "duration_min", "analysis_version"]], ["access_quality", ["stop_id"]],
];
const indexes = [
  ["transit_points_pkey", "btree", ["stop_id"]], ["culinary_poi_pkey", "btree", ["merchant_id"]],
  ["stop_snaps_pkey", "btree", ["stop_id", "analysis_version"]], ["merchant_snaps_pkey", "btree", ["merchant_id", "analysis_version"]],
  ["stop_merchant_access_pkey", "btree", ["stop_id", "merchant_id", "analysis_version"]], ["stop_isochrones_pkey", "btree", ["stop_id", "duration_min", "analysis_version"]], ["access_quality_pkey", "btree", ["stop_id"]],
  ["transit_points_geometry_gix", "gist", ["geometry"]], ["culinary_poi_geometry_gix", "gist", ["geometry"]], ["stop_isochrones_geometry_gix", "gist", ["geometry"]],
  ["stop_snaps_analysis_version_idx", "btree", ["analysis_version"]], ["merchant_snaps_analysis_version_idx", "btree", ["analysis_version"]], ["stop_merchant_access_merchant_version_idx", "btree", ["merchant_id", "analysis_version"]],
  ["stop_merchant_access_discovery_5_idx", "btree", ["analysis_version", "stop_id", "reachable_5min", "walking_time_seconds"]], ["stop_merchant_access_discovery_10_idx", "btree", ["analysis_version", "stop_id", "reachable_10min", "walking_time_seconds"]], ["stop_isochrones_analysis_version_idx", "btree", ["analysis_version"]],
];

function readOnly(sql: string) {
  return sql.replace(/^\s*\/\*[\s\S]*?\*\//, "").trimStart().startsWith("SELECT")
    || sql.replace(/^\s*\/\*[\s\S]*?\*\//, "").trimStart().startsWith("WITH");
}

describe("PHASE-05 read-only database verification", () => {
  it("accepts only parsed text arrays with the exact catalog column order", () => {
    expect(sameColumns(["stop_id", "analysis_version"], ["stop_id", "analysis_version"])).toBe(true);
    expect(sameColumns(["analysis_version", "stop_id"], ["stop_id", "analysis_version"])).toBe(false);
    expect(sameColumns("{stop_id,analysis_version}", ["stop_id", "analysis_version"])).toBe(false);
  });

  it("checks the migration catalog and runtime privileges without issuing mutations", async () => {
    const queries: string[] = [];
    const adminClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("phase05: postgis")) return { rowCount: 1, rows: [{ schema_name: "gis" }] };
        if (sql.includes("phase05: schema")) return { rowCount: 1, rows: [{ schema_exists: true }] };
        if (sql.includes("phase05: tables")) return { rowCount: tables.length, rows: tables.map((tablename) => ({ tablename })) };
        if (sql.includes("phase05: constraints")) return { rowCount: primaryKeys.length, rows: primaryKeys.map(([table_name, columns]) => ({ table_name, contype: "p", columns })) };
        if (sql.includes("phase05: indexes")) return { rowCount: indexes.length, rows: indexes.map(([index_name, access_method, columns]) => ({ index_name, access_method, columns })) };
        if (sql.includes("phase05: empty counts")) return { rowCount: tables.length, rows: tables.map((table_name) => ({ table_name, row_count: "0" })) };
        if (sql.includes("phase05: client role privileges")) return {
          rowCount: tables.length * 2,
          rows: ["anon", "authenticated"].flatMap((role_name) => tables.map((table_name) => ({
            role_name, table_name, schema_usage: false, schema_create: false, can_select: false, can_insert: false, can_update: false, can_delete: false,
          }))),
        };
        throw new Error(`Unexpected admin query: ${sql}`);
      }),
      release: vi.fn(),
    };
    const runtimeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("phase05: runtime privileges")) return {
          rowCount: tables.length,
          rows: tables.map((table_name) => ({
            runtime_role: "rujak_runtime", table_name, schema_usage: true, schema_create: false,
            can_select: true, can_insert: false, can_update: false, can_delete: false,
          })),
        };
        if (sql.includes("phase05: runtime selects")) return { rowCount: 1, rows: [{}] };
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

    const summary = await verifyPhase05Database({
      adminConnectionString: "postgresql://admin@localhost/postgres?sslmode=verify-full",
      runtimeConnectionString: "postgresql://runtime@localhost/postgres?sslmode=verify-full",
      postgisSchema: "gis",
      PoolConstructor: FakePool,
    });

    expect(summary.empty_row_counts).toEqual(Object.fromEntries(tables.map((table) => [table, 0])));
    expect(queries).not.toHaveLength(0);
    expect(queries.every(readOnly)).toBe(true);
    const constraintQuery = queries.find((sql) => sql.includes("phase05: constraints"));
    expect(constraintQuery).toContain("FROM pg_constraint AS con");
    expect(constraintQuery).not.toContain("AS constraint");
    expect(constraintQuery).toContain("array_agg(attribute.attname::text ORDER BY key.ordinality)");
    const indexQuery = queries.find((sql) => sql.includes("phase05: indexes"));
    expect(indexQuery).toContain("array_agg(attribute.attname::text ORDER BY key.ordinality)");
    expect(adminClient.release).toHaveBeenCalledOnce();
    expect(runtimeClient.release).toHaveBeenCalledOnce();
    expect(adminPool.end).toHaveBeenCalledOnce();
    expect(runtimePool.end).toHaveBeenCalledOnce();
  });
});
