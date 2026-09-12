import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromWeb = createRequire(path.join(ROOT, "apps", "web", "package.json"));
const { Pool } = requireFromWeb("pg");

const SCHEMA = "rujak";
const RUNTIME_ROLE = "rujak_runtime";
const CLIENT_ROLES = ["anon", "authenticated"];
const TABLES = [
  "transit_points",
  "culinary_poi",
  "stop_snaps",
  "merchant_snaps",
  "stop_merchant_access",
  "stop_isochrones",
  "access_quality",
];
const PRIMARY_KEYS = new Map([
  ["transit_points", ["stop_id"]],
  ["culinary_poi", ["merchant_id"]],
  ["stop_snaps", ["stop_id", "analysis_version"]],
  ["merchant_snaps", ["merchant_id", "analysis_version"]],
  ["stop_merchant_access", ["stop_id", "merchant_id", "analysis_version"]],
  ["stop_isochrones", ["stop_id", "duration_min", "analysis_version"]],
  ["access_quality", ["stop_id"]],
]);
const INDEXES = [
  ["transit_points_pkey", "btree", ["stop_id"]],
  ["culinary_poi_pkey", "btree", ["merchant_id"]],
  ["stop_snaps_pkey", "btree", ["stop_id", "analysis_version"]],
  ["merchant_snaps_pkey", "btree", ["merchant_id", "analysis_version"]],
  ["stop_merchant_access_pkey", "btree", ["stop_id", "merchant_id", "analysis_version"]],
  ["stop_isochrones_pkey", "btree", ["stop_id", "duration_min", "analysis_version"]],
  ["access_quality_pkey", "btree", ["stop_id"]],
  ["transit_points_geometry_gix", "gist", ["geometry"]],
  ["culinary_poi_geometry_gix", "gist", ["geometry"]],
  ["stop_isochrones_geometry_gix", "gist", ["geometry"]],
  ["stop_snaps_analysis_version_idx", "btree", ["analysis_version"]],
  ["merchant_snaps_analysis_version_idx", "btree", ["analysis_version"]],
  ["stop_merchant_access_merchant_version_idx", "btree", ["merchant_id", "analysis_version"]],
  ["stop_merchant_access_discovery_5_idx", "btree", ["analysis_version", "stop_id", "reachable_5min", "walking_time_seconds"]],
  ["stop_merchant_access_discovery_10_idx", "btree", ["analysis_version", "stop_id", "reachable_10min", "walking_time_seconds"]],
  ["stop_isochrones_analysis_version_idx", "btree", ["analysis_version"]],
];

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function sameColumns(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((column, index) => column === expected[index]);
}

async function withClient(pool, work) {
  let client;
  try {
    client = await pool.connect();
    return await work(client);
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

async function verifyAdmin(client, postgisSchema) {
  const postgis = await client.query(`/* phase05: postgis */
    SELECT namespace.nspname AS schema_name
      FROM pg_extension AS extension
      JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
     WHERE extension.extname = 'postgis'`);
  assert(postgis.rowCount === 1 && postgis.rows[0].schema_name === postgisSchema,
    `PostGIS must be installed in ${postgisSchema}.`);

  const schema = await client.query(`/* phase05: schema */
    SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS schema_exists`, [SCHEMA]);
  assert(schema.rows[0]?.schema_exists === true, "Schema rujak is missing.");

  const tables = await client.query(`/* phase05: tables */
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = $1
     ORDER BY tablename`, [SCHEMA]);
  const actualTables = new Set(tables.rows.map((row) => row.tablename));
  for (const table of TABLES) assert(actualTables.has(table), `Required table rujak.${table} is missing.`);

  const constraints = await client.query(`/* phase05: constraints */
    SELECT relation.relname AS table_name, con.contype,
           array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns
      FROM pg_constraint AS con
      JOIN pg_class AS relation ON relation.oid = con.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
     WHERE namespace.nspname = $1 AND con.contype IN ('p', 'u')
     GROUP BY relation.relname, con.contype`, [SCHEMA]);
  for (const [table, columns] of PRIMARY_KEYS) {
    assert(constraints.rows.some((row) => row.table_name === table && row.contype === "p" && sameColumns(row.columns, columns)),
      `Primary key for rujak.${table} is missing or incorrect.`);
  }

  const indexes = await client.query(`/* phase05: indexes */
    SELECT index_relation.relname AS index_name, access_method.amname AS access_method,
           array_agg(attribute.attname::text ORDER BY key.ordinality) FILTER (WHERE key.attnum > 0) AS columns
      FROM pg_index AS index_data
      JOIN pg_class AS relation ON relation.oid = index_data.indrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
      JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
      JOIN LATERAL unnest(index_data.indkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      LEFT JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
     WHERE namespace.nspname = $1
     GROUP BY index_relation.relname, access_method.amname`, [SCHEMA]);
  for (const [name, method, columns] of INDEXES) {
    assert(indexes.rows.some((row) => row.index_name === name && row.access_method === method && sameColumns(row.columns, columns)),
      `Required ${method} index ${name} is missing or incorrect.`);
  }

  const counts = await client.query(`/* phase05: empty counts */
    SELECT 'transit_points' AS table_name, COUNT(*)::text AS row_count FROM rujak.transit_points
    UNION ALL SELECT 'culinary_poi', COUNT(*)::text FROM rujak.culinary_poi
    UNION ALL SELECT 'stop_snaps', COUNT(*)::text FROM rujak.stop_snaps
    UNION ALL SELECT 'merchant_snaps', COUNT(*)::text FROM rujak.merchant_snaps
    UNION ALL SELECT 'stop_merchant_access', COUNT(*)::text FROM rujak.stop_merchant_access
    UNION ALL SELECT 'stop_isochrones', COUNT(*)::text FROM rujak.stop_isochrones
    UNION ALL SELECT 'access_quality', COUNT(*)::text FROM rujak.access_quality`);
  const rowCounts = Object.fromEntries(counts.rows.map((row) => [row.table_name, Number(row.row_count)]));
  for (const table of TABLES) assert(rowCounts[table] === 0, `rujak.${table} must be empty before import.`);

  const clientPrivileges = await client.query(`/* phase05: client role privileges */
    WITH client_roles(role_name) AS (VALUES ('anon'), ('authenticated')),
    required_tables(table_name) AS (VALUES ('transit_points'), ('culinary_poi'), ('stop_snaps'), ('merchant_snaps'), ('stop_merchant_access'), ('stop_isochrones'), ('access_quality'))
    SELECT client_roles.role_name, required_tables.table_name,
           has_schema_privilege(client_roles.role_name, 'rujak', 'USAGE') AS schema_usage,
           has_schema_privilege(client_roles.role_name, 'rujak', 'CREATE') AS schema_create,
           has_table_privilege(client_roles.role_name, format('rujak.%I', required_tables.table_name), 'SELECT') AS can_select,
           has_table_privilege(client_roles.role_name, format('rujak.%I', required_tables.table_name), 'INSERT') AS can_insert,
           has_table_privilege(client_roles.role_name, format('rujak.%I', required_tables.table_name), 'UPDATE') AS can_update,
           has_table_privilege(client_roles.role_name, format('rujak.%I', required_tables.table_name), 'DELETE') AS can_delete
      FROM client_roles CROSS JOIN required_tables`);
  assert(clientPrivileges.rowCount === CLIENT_ROLES.length * TABLES.length, "Supabase client roles are unavailable for privilege verification.");
  for (const row of clientPrivileges.rows) {
    assert(!row.schema_usage && !row.schema_create && !row.can_select && !row.can_insert && !row.can_update && !row.can_delete,
      `Supabase client role ${row.role_name} has unintended access to rujak.${row.table_name}.`);
  }

  return rowCounts;
}

async function verifyRuntime(client) {
  const privileges = await client.query(`/* phase05: runtime privileges */
    WITH required_tables(table_name) AS (VALUES ('transit_points'), ('culinary_poi'), ('stop_snaps'), ('merchant_snaps'), ('stop_merchant_access'), ('stop_isochrones'), ('access_quality'))
    SELECT current_user AS runtime_role, required_tables.table_name,
           has_schema_privilege(current_user, 'rujak', 'USAGE') AS schema_usage,
           has_schema_privilege(current_user, 'rujak', 'CREATE') AS schema_create,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'SELECT') AS can_select,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'INSERT') AS can_insert,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'UPDATE') AS can_update,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'DELETE') AS can_delete
      FROM required_tables`);
  assert(privileges.rowCount === TABLES.length, "Runtime role could not enumerate required RUJAK tables.");
  for (const row of privileges.rows) {
    assert(row.runtime_role === RUNTIME_ROLE, "DATABASE_URL_RUNTIME did not connect as rujak_runtime.");
    assert(row.schema_usage && !row.schema_create && row.can_select && !row.can_insert && !row.can_update && !row.can_delete,
      `Runtime role privilege contract failed for rujak.${row.table_name}.`);
  }

  await client.query(`/* phase05: runtime selects */
    SELECT
      EXISTS (SELECT 1 FROM rujak.transit_points) AS transit_points,
      EXISTS (SELECT 1 FROM rujak.culinary_poi) AS culinary_poi,
      EXISTS (SELECT 1 FROM rujak.stop_snaps) AS stop_snaps,
      EXISTS (SELECT 1 FROM rujak.merchant_snaps) AS merchant_snaps,
      EXISTS (SELECT 1 FROM rujak.stop_merchant_access) AS stop_merchant_access,
      EXISTS (SELECT 1 FROM rujak.stop_isochrones) AS stop_isochrones,
      EXISTS (SELECT 1 FROM rujak.access_quality) AS access_quality`);
}

export async function verifyPhase05Database({ adminConnectionString, runtimeConnectionString, postgisSchema, PoolConstructor = Pool }) {
  const adminPool = new PoolConstructor({ connectionString: adminConnectionString, max: 1, application_name: "rujak-phase05-verification-admin" });
  const runtimePool = new PoolConstructor({ connectionString: runtimeConnectionString, max: 1, application_name: "rujak-phase05-verification-runtime" });
  const rowCounts = await withClient(adminPool, (client) => verifyAdmin(client, postgisSchema));
  await withClient(runtimePool, verifyRuntime);
  return { postgis_schema: postgisSchema, schema: SCHEMA, tables: TABLES, empty_row_counts: rowCounts, runtime_role: RUNTIME_ROLE };
}

async function main() {
  const summary = await verifyPhase05Database({
    adminConnectionString: required(process.env.DATABASE_URL_ADMIN, "DATABASE_URL_ADMIN"),
    runtimeConnectionString: required(process.env.DATABASE_URL_RUNTIME, "DATABASE_URL_RUNTIME"),
    postgisSchema: required(process.env.RUJAK_POSTGIS_SCHEMA, "RUJAK_POSTGIS_SCHEMA"),
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "PHASE-05 database verification failed.");
    process.exitCode = 1;
  });
}
