import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromWeb = createRequire(path.join(ROOT, "apps", "web", "package.json"));
const { Pool } = requireFromWeb("pg");
const PRIMARY_STOP_ID = "6a92c77152d86e03b51db962";
const TABLES = ["transit_points", "culinary_poi", "stop_snaps", "merchant_snaps", "stop_merchant_access", "stop_isochrones", "access_quality"];
const EXPECTED_COUNTS = {
  transit_points: 9,
  culinary_poi: 355,
  stop_snaps: 9,
  merchant_snaps: 355,
  stop_merchant_access: 3195,
  stop_isochrones: 18,
  access_quality: 9,
};

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function quoteIdentifier(value, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`${name} must be a PostgreSQL identifier.`);
  return `"${value}"`;
}

function near(actual, expected) {
  return Number.isFinite(Number(actual)) && Math.abs(Number(actual) - Number(expected)) <= 0.000001;
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

export async function loadExpectedDiscovery(version) {
  const source = JSON.parse(await readFile(path.join(ROOT, "data", "processed", "p0", "stop_merchant_access.geojson"), "utf8"));
  assert(source?.type === "FeatureCollection" && Array.isArray(source.features), "Canonical PHASE-04 access source is invalid.");
  const rows = source.features
    .map((feature) => feature?.properties)
    .filter((properties) => properties?.stop_id === PRIMARY_STOP_ID && properties.analysis_version === version)
    .map((properties) => ({
      merchant_id: properties.merchant_id,
      walking_distance_m: properties.total_distance_m,
      walking_time_seconds: properties.walking_time_seconds,
      walking_time_min: properties.walking_time_min,
      reachable_5min: properties.reachable_5min,
      reachable_10min: properties.reachable_10min,
    }));
  assert(rows.length === EXPECTED_COUNTS.culinary_poi, "Canonical PHASE-04 access source lacks the primary-stop P0 bundle.");
  return {
    five: rows.filter((row) => row.reachable_5min).sort((a, b) => a.walking_time_seconds - b.walking_time_seconds || a.merchant_id.localeCompare(b.merchant_id)),
    ten: rows.filter((row) => row.reachable_10min).sort((a, b) => a.walking_time_seconds - b.walking_time_seconds || a.merchant_id.localeCompare(b.merchant_id)),
  };
}

function assertDiscovery(actual, expected, threshold) {
  assert(actual.length === expected.length, `Primary-stop ${threshold}-minute discovery count differs from PHASE-04 source.`);
  actual.forEach((row, index) => {
    const source = expected[index];
    assert(row.merchant_id === source.merchant_id, `Primary-stop ${threshold}-minute discovery merchant order/ID differs at index ${index}.`);
    assert(near(row.walking_distance_m, source.walking_distance_m)
      && near(row.walking_time_seconds, source.walking_time_seconds)
      && near(row.walking_time_min, source.walking_time_min),
    `Primary-stop ${threshold}-minute walking values differ for merchant ${row.merchant_id}.`);
  });
}

async function verifyAdmin(client, analysisVersion, postgisIdentifier) {
  const counts = await client.query(`/* phase05-import: counts */
    SELECT
      (SELECT COUNT(*)::text FROM rujak.transit_points) AS transit_points,
      (SELECT COUNT(*)::text FROM rujak.culinary_poi) AS culinary_poi,
      (SELECT COUNT(*)::text FROM rujak.stop_snaps WHERE analysis_version = $1) AS stop_snaps,
      (SELECT COUNT(*)::text FROM rujak.merchant_snaps WHERE analysis_version = $1) AS merchant_snaps,
      (SELECT COUNT(*)::text FROM rujak.stop_merchant_access WHERE analysis_version = $1) AS stop_merchant_access,
      (SELECT COUNT(*)::text FROM rujak.stop_isochrones WHERE analysis_version = $1) AS stop_isochrones,
      (SELECT COUNT(*)::text FROM rujak.access_quality) AS access_quality`, [analysisVersion]);
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    assert(Number(counts.rows[0]?.[table]) === expected, `Unexpected imported row count for ${table}.`);
  }

  const uniqueness = await client.query(`/* phase05-import: uniqueness */
    SELECT
      (SELECT COUNT(DISTINCT stop_id)::text FROM rujak.transit_points) AS unique_stops,
      (SELECT COUNT(DISTINCT merchant_id)::text FROM rujak.culinary_poi) AS unique_merchants,
      (SELECT COUNT(*)::text FROM (SELECT stop_id, analysis_version FROM rujak.stop_snaps WHERE analysis_version = $1 GROUP BY stop_id, analysis_version HAVING COUNT(*) > 1) AS duplicates) AS duplicate_stop_snaps,
      (SELECT COUNT(*)::text FROM (SELECT merchant_id, analysis_version FROM rujak.merchant_snaps WHERE analysis_version = $1 GROUP BY merchant_id, analysis_version HAVING COUNT(*) > 1) AS duplicates) AS duplicate_merchant_snaps,
      (SELECT COUNT(*)::text FROM (SELECT stop_id, merchant_id, analysis_version FROM rujak.stop_merchant_access WHERE analysis_version = $1 GROUP BY stop_id, merchant_id, analysis_version HAVING COUNT(*) > 1) AS duplicates) AS duplicate_access,
      (SELECT COUNT(*)::text FROM (SELECT stop_id, duration_min, analysis_version FROM rujak.stop_isochrones WHERE analysis_version = $1 GROUP BY stop_id, duration_min, analysis_version HAVING COUNT(*) > 1) AS duplicates) AS duplicate_isochrones`, [analysisVersion]);
  const unique = uniqueness.rows[0] ?? {};
  assert(Number(unique.unique_stops) === 9 && Number(unique.unique_merchants) === 355, "Canonical IDs are not unique.");
  for (const field of ["duplicate_stop_snaps", "duplicate_merchant_snaps", "duplicate_access", "duplicate_isochrones"]) {
    assert(Number(unique[field]) === 0, `Versioned table contains duplicate keys: ${field}.`);
  }

  const versions = await client.query(`/* phase05-import: versions */
    SELECT 'stop_snaps' AS table_name, array_agg(DISTINCT analysis_version::text ORDER BY analysis_version::text) AS versions FROM rujak.stop_snaps
    UNION ALL SELECT 'merchant_snaps', array_agg(DISTINCT analysis_version::text ORDER BY analysis_version::text) FROM rujak.merchant_snaps
    UNION ALL SELECT 'stop_merchant_access', array_agg(DISTINCT analysis_version::text ORDER BY analysis_version::text) FROM rujak.stop_merchant_access
    UNION ALL SELECT 'stop_isochrones', array_agg(DISTINCT analysis_version::text ORDER BY analysis_version::text) FROM rujak.stop_isochrones`);
  for (const row of versions.rows) {
    assert(Array.isArray(row.versions) && row.versions.length === 1 && row.versions[0] === analysisVersion,
      `Unexpected analysis versions in ${row.table_name}.`);
  }

  const integrity = await client.query(`/* phase05-import: integrity */
    SELECT 'stop_snaps' AS relation, COUNT(*)::text AS invalid_count FROM rujak.stop_snaps AS snap LEFT JOIN rujak.transit_points AS stop ON stop.stop_id = snap.stop_id WHERE stop.stop_id IS NULL
    UNION ALL SELECT 'merchant_snaps', COUNT(*)::text FROM rujak.merchant_snaps AS snap LEFT JOIN rujak.culinary_poi AS merchant ON merchant.merchant_id = snap.merchant_id WHERE merchant.merchant_id IS NULL
    UNION ALL SELECT 'stop_merchant_access_stop', COUNT(*)::text FROM rujak.stop_merchant_access AS access LEFT JOIN rujak.transit_points AS stop ON stop.stop_id = access.stop_id WHERE stop.stop_id IS NULL
    UNION ALL SELECT 'stop_merchant_access_merchant', COUNT(*)::text FROM rujak.stop_merchant_access AS access LEFT JOIN rujak.culinary_poi AS merchant ON merchant.merchant_id = access.merchant_id WHERE merchant.merchant_id IS NULL
    UNION ALL SELECT 'stop_isochrones', COUNT(*)::text FROM rujak.stop_isochrones AS isochrone LEFT JOIN rujak.transit_points AS stop ON stop.stop_id = isochrone.stop_id WHERE stop.stop_id IS NULL`);
  for (const row of integrity.rows) assert(Number(row.invalid_count) === 0, `Referential integrity failed for ${row.relation}.`);

  const access = await client.query(`/* phase05-import: access invariants */
    SELECT COUNT(*)::text AS invalid_count
      FROM rujak.stop_merchant_access
     WHERE analysis_version = $1
       AND (
         (routing_status = 'routable' AND (network_distance_m IS NULL OR total_distance_m IS NULL OR walking_time_seconds IS NULL OR walking_time_min IS NULL OR reachable_5min IS NULL OR reachable_10min IS NULL OR network_distance_m < 0 OR total_distance_m < network_distance_m OR walking_time_seconds < 0 OR walking_time_min < 0 OR abs((walking_time_min * 60) - walking_time_seconds) > 0.000001 OR abs(walking_time_seconds - (total_distance_m / 1.3)) > 0.000001 OR (reachable_5min IS TRUE AND reachable_10min IS NOT TRUE) OR (reachable_5min IS TRUE AND walking_time_seconds > 300) OR (reachable_10min IS TRUE AND walking_time_seconds > 600)))
         OR (routing_status <> 'routable' AND (network_distance_m IS NOT NULL OR total_distance_m IS NOT NULL OR walking_time_seconds IS NOT NULL OR walking_time_min IS NOT NULL OR reachable_5min IS NOT NULL OR reachable_10min IS NOT NULL))
       )`, [analysisVersion]);
  assert(Number(access.rows[0]?.invalid_count) === 0, "Routing analytical invariants failed.");

  const isochrones = await client.query(`/* phase05-import: isochrones */
    SELECT stop_id, COUNT(*)::text AS row_count,
           array_agg(duration_min ORDER BY duration_min) AS durations,
           bool_and(geometry IS NOT NULL AND ${postgisIdentifier}.ST_IsValid(geometry) AND NOT ${postgisIdentifier}.ST_IsEmpty(geometry)) AS valid_geometry
      FROM rujak.stop_isochrones
     WHERE analysis_version = $1
     GROUP BY stop_id`, [analysisVersion]);
  assert(isochrones.rowCount === 9, "Isochrones must cover exactly nine P0 stops.");
  for (const row of isochrones.rows) {
    assert(Number(row.row_count) === 2 && Array.isArray(row.durations) && row.durations.length === 2 && Number(row.durations[0]) === 5 && Number(row.durations[1]) === 10 && row.valid_geometry,
      `Isochrone contract failed for stop ${row.stop_id}.`);
  }

  const primary = await client.query(`/* phase05-import: primary stop */
    SELECT EXISTS (SELECT 1 FROM rujak.transit_points WHERE stop_id = $1) AS canonical_stop,
           (SELECT COUNT(*)::text FROM rujak.stop_snaps WHERE stop_id = $1 AND analysis_version = $2) AS stop_snaps,
           (SELECT COUNT(*)::text FROM rujak.stop_merchant_access WHERE stop_id = $1 AND analysis_version = $2) AS access_rows,
           (SELECT COUNT(*)::text FROM rujak.stop_isochrones WHERE stop_id = $1 AND analysis_version = $2) AS isochrones`, [PRIMARY_STOP_ID, analysisVersion]);
  const primaryRow = primary.rows[0] ?? {};
  assert(primaryRow.canonical_stop && Number(primaryRow.stop_snaps) === 1 && Number(primaryRow.access_rows) === 355 && Number(primaryRow.isochrones) === 2,
    "Primary demo stop is incomplete.");

  const unsupported = await client.query(`/* phase05-import: unsupported culinary fields */
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'rujak' AND table_name = 'culinary_poi'
       AND lower(column_name) = ANY($1::text[])`, [["price", "price_range", "rating", "opening_hours", "opening_hour", "open_hours"]]);
  assert(unsupported.rowCount === 0, "P0 culinary schema contains unsupported price/rating/opening-hours fields.");
}

async function verifyRuntime(client, analysisVersion, expectedDiscovery) {
  const privileges = await client.query(`/* phase05-import: runtime privileges */
    WITH required_tables(table_name) AS (VALUES ('transit_points'), ('culinary_poi'), ('stop_snaps'), ('merchant_snaps'), ('stop_merchant_access'), ('stop_isochrones'), ('access_quality'))
    SELECT current_user AS runtime_role, required_tables.table_name,
           has_schema_privilege(current_user, 'rujak', 'USAGE') AS schema_usage,
           has_schema_privilege(current_user, 'rujak', 'CREATE') AS schema_create,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'SELECT') AS can_select,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'INSERT') AS can_insert,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'UPDATE') AS can_update,
           has_table_privilege(current_user, format('rujak.%I', required_tables.table_name), 'DELETE') AS can_delete
      FROM required_tables`);
  assert(privileges.rowCount === TABLES.length, "Runtime role could not enumerate populated RUJAK tables.");
  for (const row of privileges.rows) {
    assert(row.runtime_role === "rujak_runtime" && row.schema_usage && !row.schema_create && row.can_select && !row.can_insert && !row.can_update && !row.can_delete,
      `Runtime least-privilege contract failed for rujak.${row.table_name}.`);
  }

  await client.query(`/* phase05-import: runtime populated selects */
    SELECT
      EXISTS (SELECT 1 FROM rujak.transit_points) AS transit_points,
      EXISTS (SELECT 1 FROM rujak.culinary_poi) AS culinary_poi,
      EXISTS (SELECT 1 FROM rujak.stop_snaps WHERE analysis_version = $1) AS stop_snaps,
      EXISTS (SELECT 1 FROM rujak.merchant_snaps WHERE analysis_version = $1) AS merchant_snaps,
      EXISTS (SELECT 1 FROM rujak.stop_merchant_access WHERE analysis_version = $1) AS stop_merchant_access,
      EXISTS (SELECT 1 FROM rujak.stop_isochrones WHERE analysis_version = $1) AS stop_isochrones,
      EXISTS (SELECT 1 FROM rujak.access_quality) AS access_quality`, [analysisVersion]);

  const discovery = async (threshold, expected) => {
    const result = await client.query(`/* phase05-import: runtime discovery ${threshold} */
      SELECT access.merchant_id::text AS merchant_id, access.total_distance_m AS walking_distance_m,
             access.walking_time_seconds, access.walking_time_min
        FROM rujak.stop_merchant_access AS access
        JOIN rujak.culinary_poi AS merchant ON merchant.merchant_id = access.merchant_id
       WHERE access.stop_id = $1 AND access.analysis_version = $2 AND access.reachable_${threshold}min IS TRUE
       ORDER BY access.walking_time_seconds ASC, merchant.merchant_id ASC`, [PRIMARY_STOP_ID, analysisVersion]);
    assertDiscovery(result.rows, expected, threshold);
  };
  await discovery(5, expectedDiscovery.five);
  await discovery(10, expectedDiscovery.ten);
}

export async function verifyPhase05Import({ adminConnectionString, runtimeConnectionString, analysisVersion, postgisSchema, expectedDiscovery, PoolConstructor = Pool }) {
  const postgisIdentifier = quoteIdentifier(postgisSchema, "RUJAK_POSTGIS_SCHEMA");
  const discovery = expectedDiscovery ?? await loadExpectedDiscovery(analysisVersion);
  const adminPool = new PoolConstructor({ connectionString: adminConnectionString, max: 1, application_name: "rujak-phase05-import-verification-admin" });
  const runtimePool = new PoolConstructor({ connectionString: runtimeConnectionString, max: 1, application_name: "rujak-phase05-import-verification-runtime" });
  await withClient(adminPool, (client) => verifyAdmin(client, analysisVersion, postgisIdentifier));
  await withClient(runtimePool, (client) => verifyRuntime(client, analysisVersion, discovery));
  return { analysis_version: analysisVersion, expected_counts: EXPECTED_COUNTS, primary_stop_id: PRIMARY_STOP_ID, discovery: { reachable_5min: discovery.five.length, reachable_10min: discovery.ten.length } };
}

async function main() {
  const summary = await verifyPhase05Import({
    adminConnectionString: required(process.env.DATABASE_URL_ADMIN, "DATABASE_URL_ADMIN"),
    runtimeConnectionString: required(process.env.DATABASE_URL_RUNTIME, "DATABASE_URL_RUNTIME"),
    analysisVersion: required(process.env.RUJAK_ANALYSIS_VERSION, "RUJAK_ANALYSIS_VERSION"),
    postgisSchema: required(process.env.RUJAK_POSTGIS_SCHEMA, "RUJAK_POSTGIS_SCHEMA"),
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "PHASE-05 post-import verification failed.");
    process.exitCode = 1;
  });
}
