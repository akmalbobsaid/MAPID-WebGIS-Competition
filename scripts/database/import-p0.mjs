import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const requireFromWeb = createRequire(path.join(ROOT, "apps", "web", "package.json"));
const { parse } = requireFromWeb("csv-parse/sync");
const { Pool } = requireFromWeb("pg");
const P0_VERSION = "p0-central-v1";
const PRIMARY_STOP_ID = "6a92c77152d86e03b51db962";
const ANALYSIS_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STOP_ID = /^[0-9a-f]{24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYTICAL_STATUS = new Set(["routable", "disconnected", "snap_too_far"]);
const ACCESS_QUALITY_STATUS = new Set(["pending", "approved"]);
const ACCESS_QUALITY_FIELDS = ["approved_shelter", "approved_seating", "approved_pedestrian_condition", "approved_cleanliness", "approved_traffic_condition"];
const REVIEW_TEXT_MAX_LENGTH = 160;
const REVIEWER_MAX_LENGTH = 120;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(value, message) {
  if (value === undefined || value === null || value === "") throw new Error(message);
  return value;
}

function quoteIdentifier(value, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`${name} must be a PostgreSQL identifier.`);
  return `"${value}"`;
}

async function readJson(relativePath) {
  const parsed = JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
  if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${relativePath} is not a GeoJSON FeatureCollection.`);
  }
  return parsed;
}

function requireMetadata(collection, sourceName, expectedVersion, requiresVersion) {
  if (collection.metadata?.output_crs !== "EPSG:4326") {
    throw new Error(`${sourceName} must explicitly declare output_crs EPSG:4326.`);
  }
  if (requiresVersion && collection.metadata?.analysis_version !== expectedVersion) {
    throw new Error(`${sourceName} does not match analysis_version ${expectedVersion}.`);
  }
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizedReviewText(value, field, maxLength = REVIEW_TEXT_MAX_LENGTH) {
  const raw = nullableString(value);
  if (raw !== null && /[\u0000-\u001F\u007F]/u.test(raw)) {
    throw new Error(`${field} must be a bounded single-line review text value.`);
  }
  const normalized = raw?.normalize("NFKC").replace(/\s+/gu, " ").trim() ?? null;
  if (normalized === null) return null;
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be a bounded single-line review text value.`);
  }
  return normalized;
}

function approvedReviewTimestamp(value) {
  const normalized = nullableString(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)
    || Number.isNaN(Date.parse(normalized))) {
    throw new Error("approved access-quality rows require reviewed_at as an ISO-8601 timestamp with timezone.");
  }
  return normalized;
}

export function validateAccessQualityRow(row, stopIds, version, seenStopIds) {
  if (!STOP_ID.test(row.stop_id) || seenStopIds.has(row.stop_id) || !stopIds.has(row.stop_id)) {
    throw new Error("Access-quality review seed has an invalid or duplicate canonical stop_id.");
  }
  if (row.analysis_version !== version || !nullableString(row.description_raw)) {
    throw new Error("Access-quality review seed has inconsistent analysis_version or missing raw evidence.");
  }
  if (!ACCESS_QUALITY_STATUS.has(row.review_status)) {
    throw new Error("Access-quality review status must be pending or approved.");
  }

  const approved = Object.fromEntries(ACCESS_QUALITY_FIELDS.map((field) => [field, normalizedReviewText(row[field], field)]));
  const reviewer = normalizedReviewText(row.reviewed_by, "reviewed_by", REVIEWER_MAX_LENGTH);
  const reviewNotes = normalizedReviewText(row.review_notes, "review_notes");
  const hasApprovedValues = Object.values(approved).some((value) => value !== null);

  if (row.review_status === "pending") {
    if (hasApprovedValues || reviewer !== null || nullableString(row.reviewed_at) !== null || reviewNotes !== null) {
      throw new Error("Pending access-quality rows cannot contain approved values or reviewer metadata.");
    }
    return { ...row, ...approved, reviewed_by: null, reviewed_at: null, review_notes: null };
  }

  const reviewedAt = approvedReviewTimestamp(row.reviewed_at);
  if (!reviewer) {
    throw new Error("Approved access-quality rows require reviewed_by.");
  }
  seenStopIds.add(row.stop_id);
  return { ...row, ...approved, reviewed_by: reviewer, reviewed_at: reviewedAt, review_notes: reviewNotes };
}

export function requireAllAccessQualityApproved(rows) {
  if (rows.length !== 9 || rows.some((row) => row.review_status !== "approved" || !row.reviewed_by || !row.reviewed_at)) {
    throw new Error("PHASE-07 PASS requires all nine access-quality records to be human-approved with reviewer metadata.");
  }
}

function numberValue(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
  return value;
}

function pointGeometry(feature, sourceName) {
  const geometry = feature?.geometry;
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    throw new Error(`${sourceName} requires a Point geometry.`);
  }
  const [longitude, latitude] = geometry.coordinates;
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(`${sourceName} has invalid EPSG:4326 coordinates.`);
  }
  return geometry;
}

function polygonGeometry(feature, sourceName) {
  const geometry = feature?.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
    throw new Error(`${sourceName} requires a Polygon or MultiPolygon geometry.`);
  }
  return geometry;
}

function featureProperties(feature, sourceName) {
  if (!feature?.properties || typeof feature.properties !== "object") throw new Error(`${sourceName} has no properties object.`);
  return feature.properties;
}

function uniqueIds(features, field, sourceName, validator) {
  const ids = new Set();
  for (const feature of features) {
    const id = featureProperties(feature, sourceName)[field];
    if (typeof id !== "string" || !validator.test(id)) throw new Error(`${sourceName} has invalid ${field}.`);
    if (ids.has(id)) throw new Error(`${sourceName} contains duplicate ${field} ${id}.`);
    ids.add(id);
  }
  return ids;
}

function sameSet(actual, expected, message) {
  if (actual.size !== expected.size || [...actual].some((value) => !expected.has(value))) throw new Error(message);
}

function analysisVersion(features, sourceName, expected) {
  for (const feature of features) {
    if (featureProperties(feature, sourceName).analysis_version !== expected) {
      throw new Error(`${sourceName} mixes or lacks analysis_version ${expected}.`);
    }
  }
}

async function loadInputs(version) {
  const [transit, culinary, stopSnaps, merchantSnaps, access, isochrones, accessQualityText] = await Promise.all([
    readJson("data/processed/p0/transit_points_p0.geojson"),
    readJson("data/processed/p0/culinary_poi_p0.geojson"),
    readJson("data/processed/p0/stop_snaps_p0.geojson"),
    readJson("data/processed/p0/merchant_snaps_p0.geojson"),
    readJson("data/processed/p0/stop_merchant_access.geojson"),
    readJson("data/processed/p0/stop_isochrones.geojson"),
    readFile(path.join(ROOT, "data/interim/access_quality_p0_review.csv"), "utf8"),
  ]);

  for (const [name, collection] of [["transit", transit], ["culinary", culinary], ["stop snaps", stopSnaps], ["merchant snaps", merchantSnaps], ["access", access], ["isochrones", isochrones]]) {
    requireMetadata(collection, name, version, ["stop snaps", "merchant snaps", "access", "isochrones"].includes(name));
  }
  for (const [name, collection] of [["stop snaps", stopSnaps], ["merchant snaps", merchantSnaps], ["access", access], ["isochrones", isochrones]]) {
    analysisVersion(collection.features, name, version);
  }

  const accessQuality = parse(accessQualityText, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: false });
  if (transit.features.length !== 9 || accessQuality.length !== 9) throw new Error("P0 requires exactly nine transit and access-quality records.");
  for (const feature of transit.features) pointGeometry(feature, "transit");
  for (const feature of culinary.features) pointGeometry(feature, "culinary");
  for (const feature of isochrones.features) polygonGeometry(feature, "isochrones");

  const stopIds = uniqueIds(transit.features, "stop_id", "transit", STOP_ID);
  const merchantIds = uniqueIds(culinary.features, "merchant_id", "culinary", UUID);
  const stopSnapIds = uniqueIds(stopSnaps.features, "stop_id", "stop snaps", STOP_ID);
  const merchantSnapIds = uniqueIds(merchantSnaps.features, "merchant_id", "merchant snaps", UUID);
  sameSet(stopSnapIds, stopIds, "Stop snap IDs do not match canonical transit IDs.");
  sameSet(merchantSnapIds, merchantIds, "Merchant snap IDs do not match canonical merchant IDs.");
  for (const feature of [...stopSnaps.features, ...merchantSnaps.features]) {
    const properties = featureProperties(feature, "snaps");
    if (!ANALYTICAL_STATUS.has(properties.routing_status) || typeof properties.node_id !== "string" || !properties.node_id
      || numberValue(properties.snap_distance_m, "snap_distance_m") < 0) {
      throw new Error("Snap contract is invalid.");
    }
  }

  if (access.features.length !== stopIds.size * merchantIds.size) throw new Error("Access row count does not equal stops × merchants.");
  const pairIds = new Set();
  let primaryFive = 0;
  let primaryTen = 0;
  for (const feature of access.features) {
    if (feature.geometry !== null) throw new Error("P0 access must not invent path geometry.");
    const properties = featureProperties(feature, "access");
    const { stop_id: stopId, merchant_id: merchantId, routing_status: status } = properties;
    if (!stopIds.has(stopId) || !merchantIds.has(merchantId)) throw new Error("Access contains a non-canonical ID.");
    if (!ANALYTICAL_STATUS.has(status)) throw new Error(`Unexpected access routing_status ${status}.`);
    const key = `${stopId}|${merchantId}|${version}`;
    if (pairIds.has(key)) throw new Error(`Duplicate access pair ${key}.`);
    pairIds.add(key);
    if (status === "routable") {
      const network = numberValue(properties.network_distance_m, "network_distance_m");
      const total = numberValue(properties.total_distance_m, "total_distance_m");
      const seconds = numberValue(properties.walking_time_seconds, "walking_time_seconds");
      const minutes = numberValue(properties.walking_time_min, "walking_time_min");
      if (network < 0 || total < network || seconds < 0 || minutes < 0 || Math.abs(seconds - total / 1.3) > 1e-6 || Math.abs(minutes * 60 - seconds) > 1e-6) {
        throw new Error("Routable access violates the P0 connector/time invariant.");
      }
      if (typeof properties.reachable_5min !== "boolean" || typeof properties.reachable_10min !== "boolean" || (properties.reachable_5min && !properties.reachable_10min)) {
        throw new Error("Routable access violates P0 threshold invariants.");
      }
    } else if ([properties.network_distance_m, properties.total_distance_m, properties.walking_time_seconds, properties.walking_time_min, properties.reachable_5min, properties.reachable_10min].some((value) => value !== null)) {
      throw new Error("Non-routable access must retain null route facts.");
    }
    if (stopId === PRIMARY_STOP_ID && properties.reachable_5min) primaryFive += 1;
    if (stopId === PRIMARY_STOP_ID && properties.reachable_10min) primaryTen += 1;
  }
  if (version === P0_VERSION && (primaryFive !== 26 || primaryTen !== 94)) {
    throw new Error("Primary stop reachability counts do not match approved PHASE-04 output.");
  }

  const isochroneKeys = new Set();
  for (const feature of isochrones.features) {
    const properties = featureProperties(feature, "isochrones");
    if (!stopIds.has(properties.stop_id) || ![5, 10].includes(properties.duration_min) || typeof properties.method !== "string") {
      throw new Error("Isochrone contract is invalid.");
    }
    const key = `${properties.stop_id}|${properties.duration_min}|${version}`;
    if (isochroneKeys.has(key)) throw new Error(`Duplicate isochrone ${key}.`);
    isochroneKeys.add(key);
  }
  if (isochroneKeys.size !== stopIds.size * 2) throw new Error("P0 requires exactly 5/10 isochrones for every stop.");

  const reviewStopIds = new Set();
  const normalizedAccessQuality = accessQuality.map((row) => {
    const normalized = validateAccessQualityRow(row, stopIds, version, reviewStopIds);
    reviewStopIds.add(row.stop_id);
    return normalized;
  });
  sameSet(reviewStopIds, stopIds, "Access-quality rows do not match canonical stops.");

  return { transit, culinary, stopSnaps, merchantSnaps, access, isochrones, accessQuality: normalizedAccessQuality, stopIds, merchantIds };
}

async function checkPostgis(client, postgisSchema) {
  const result = await client.query(`SELECT namespace.nspname AS schema_name FROM pg_extension AS extension JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace WHERE extension.extname = 'postgis'`);
  if (result.rowCount !== 1 || result.rows[0].schema_name !== postgisSchema) {
    throw new Error("Configured PostGIS schema does not match the installed extension.");
  }
}

async function insertCanonical(client, postgis, inputs) {
  for (const feature of inputs.transit.features) {
    const properties = feature.properties;
    const geometry = JSON.stringify(feature.geometry);
    const result = await client.query(`
      INSERT INTO rujak.transit_points AS target
        (stop_id, stop_name, description_raw, surveyed_at, surveyor, media, source, validation_status, scope, geometry)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, ${postgis}.ST_SetSRID(${postgis}.ST_GeomFromGeoJSON($10), 4326))
      ON CONFLICT (stop_id) DO UPDATE SET stop_id = EXCLUDED.stop_id
      WHERE target.stop_name IS NOT DISTINCT FROM EXCLUDED.stop_name
        AND target.description_raw IS NOT DISTINCT FROM EXCLUDED.description_raw
        AND target.surveyed_at IS NOT DISTINCT FROM EXCLUDED.surveyed_at
        AND target.surveyor IS NOT DISTINCT FROM EXCLUDED.surveyor
        AND target.media IS NOT DISTINCT FROM EXCLUDED.media
        AND target.source IS NOT DISTINCT FROM EXCLUDED.source
        AND target.validation_status IS NOT DISTINCT FROM EXCLUDED.validation_status
        AND target.scope IS NOT DISTINCT FROM EXCLUDED.scope
        AND ${postgis}.ST_Equals(target.geometry, EXCLUDED.geometry)
      RETURNING stop_id`, [
      properties.stop_id, properties.stop_name, nullableString(properties.description_raw), nullableString(properties.surveyed_at),
      nullableString(properties.surveyor), JSON.stringify(properties.media ?? null), properties.source, properties.validation_status,
      properties.scope, geometry,
    ]);
    if (result.rowCount !== 1) throw new Error(`Conflicting canonical transit row ${properties.stop_id}.`);
  }

  for (const feature of inputs.culinary.features) {
    const properties = feature.properties;
    const result = await client.query(`
      INSERT INTO rujak.culinary_poi AS target
        (merchant_id, merchant_name, category_l1, category_l2, category_l3, phone, address, district, village, status, collected_at, updated_at, source, validation_status, geometry)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ${postgis}.ST_SetSRID(${postgis}.ST_GeomFromGeoJSON($15), 4326))
      ON CONFLICT (merchant_id) DO UPDATE SET merchant_id = EXCLUDED.merchant_id
      WHERE target.merchant_name IS NOT DISTINCT FROM EXCLUDED.merchant_name
        AND target.category_l1 IS NOT DISTINCT FROM EXCLUDED.category_l1
        AND target.category_l2 IS NOT DISTINCT FROM EXCLUDED.category_l2
        AND target.category_l3 IS NOT DISTINCT FROM EXCLUDED.category_l3
        AND target.phone IS NOT DISTINCT FROM EXCLUDED.phone
        AND target.address IS NOT DISTINCT FROM EXCLUDED.address
        AND target.district IS NOT DISTINCT FROM EXCLUDED.district
        AND target.village IS NOT DISTINCT FROM EXCLUDED.village
        AND target.status IS NOT DISTINCT FROM EXCLUDED.status
        AND target.collected_at IS NOT DISTINCT FROM EXCLUDED.collected_at
        AND target.updated_at IS NOT DISTINCT FROM EXCLUDED.updated_at
        AND target.source IS NOT DISTINCT FROM EXCLUDED.source
        AND target.validation_status IS NOT DISTINCT FROM EXCLUDED.validation_status
        AND ${postgis}.ST_Equals(target.geometry, EXCLUDED.geometry)
      RETURNING merchant_id`, [
      properties.merchant_id, properties.merchant_name, nullableString(properties.category_l1), nullableString(properties.category_l2),
      nullableString(properties.category_l3), nullableString(properties.phone), nullableString(properties.address), nullableString(properties.district),
      nullableString(properties.village), nullableString(properties.status), nullableString(properties.collected_at), nullableString(properties.updated_at),
      properties.source, properties.validation_status, JSON.stringify(feature.geometry),
    ]);
    if (result.rowCount !== 1) throw new Error(`Conflicting canonical merchant row ${properties.merchant_id}.`);
  }
}

async function importAnalytical(client, postgis, inputs, version) {
  await client.query(`DELETE FROM rujak.stop_merchant_access WHERE analysis_version = $1`, [version]);
  await client.query(`DELETE FROM rujak.stop_isochrones WHERE analysis_version = $1`, [version]);
  await client.query(`DELETE FROM rujak.merchant_snaps WHERE analysis_version = $1`, [version]);
  await client.query(`DELETE FROM rujak.stop_snaps WHERE analysis_version = $1`, [version]);

  for (const feature of inputs.stopSnaps.features) {
    const p = feature.properties;
    await client.query(`INSERT INTO rujak.stop_snaps (stop_id, analysis_version, node_id, snap_distance_m, routing_status) VALUES ($1, $2, $3, $4, $5)`,
      [p.stop_id, version, p.node_id, numberValue(p.snap_distance_m, "stop snap distance"), p.routing_status]);
  }
  for (const feature of inputs.merchantSnaps.features) {
    const p = feature.properties;
    await client.query(`INSERT INTO rujak.merchant_snaps (merchant_id, analysis_version, node_id, snap_distance_m, routing_status) VALUES ($1::uuid, $2, $3, $4, $5)`,
      [p.merchant_id, version, p.node_id, numberValue(p.snap_distance_m, "merchant snap distance"), p.routing_status]);
  }
  for (const feature of inputs.access.features) {
    const p = feature.properties;
    await client.query(`
      INSERT INTO rujak.stop_merchant_access
        (stop_id, merchant_id, analysis_version, network_distance_m, total_distance_m, walking_time_seconds, walking_time_min, reachable_5min, reachable_10min, routing_status, path_geometry)
      VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $11::text IS NULL THEN NULL ELSE ${postgis}.ST_SetSRID(${postgis}.ST_GeomFromGeoJSON($11), 4326) END)`,
      [p.stop_id, p.merchant_id, version, p.network_distance_m, p.total_distance_m, p.walking_time_seconds, p.walking_time_min, p.reachable_5min, p.reachable_10min, p.routing_status, null]);
  }
  for (const feature of inputs.isochrones.features) {
    const p = feature.properties;
    await client.query(`
      INSERT INTO rujak.stop_isochrones (stop_id, duration_min, method, analysis_version, geometry)
      VALUES ($1, $2, $3, $4, ${postgis}.ST_SetSRID(${postgis}.ST_GeomFromGeoJSON($5), 4326))`,
      [p.stop_id, p.duration_min, p.method, version, JSON.stringify(feature.geometry)]);
  }
}

async function importAccessQuality(client, inputs) {
  for (const row of inputs.accessQuality) {
    const approved = row.review_status === "approved";
    await client.query(`
      INSERT INTO rujak.access_quality AS target
        (stop_id, evidence_text, shelter, seating, pedestrian_condition, cleanliness, traffic_condition, review_status, reviewed_by, reviewed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (stop_id) DO UPDATE SET
        evidence_text = EXCLUDED.evidence_text,
        shelter = EXCLUDED.shelter,
        seating = EXCLUDED.seating,
        pedestrian_condition = EXCLUDED.pedestrian_condition,
        cleanliness = EXCLUDED.cleanliness,
        traffic_condition = EXCLUDED.traffic_condition,
        review_status = EXCLUDED.review_status,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at
      WHERE target.review_status = 'pending' OR EXCLUDED.review_status = 'approved'`, [
      row.stop_id,
      nullableString(row.description_raw),
      approved ? row.approved_shelter : null,
      approved ? row.approved_seating : null,
      approved ? row.approved_pedestrian_condition : null,
      approved ? row.approved_cleanliness : null,
      approved ? row.approved_traffic_condition : null,
      row.review_status,
      approved ? row.reviewed_by : null,
      approved ? row.reviewed_at : null,
    ]);
  }
}

async function counts(client, version) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM rujak.transit_points) AS transit_points,
      (SELECT COUNT(*) FROM rujak.culinary_poi) AS culinary_poi,
      (SELECT COUNT(*) FROM rujak.stop_snaps WHERE analysis_version = $1) AS stop_snaps,
      (SELECT COUNT(*) FROM rujak.merchant_snaps WHERE analysis_version = $1) AS merchant_snaps,
      (SELECT COUNT(*) FROM rujak.stop_merchant_access WHERE analysis_version = $1) AS stop_merchant_access,
      (SELECT COUNT(*) FROM rujak.stop_isochrones WHERE analysis_version = $1) AS stop_isochrones,
      (SELECT COUNT(*) FROM rujak.access_quality) AS access_quality`, [version]);
  return result.rows[0];
}

async function main() {
  const databaseUrl = option("--database-url") ?? process.env.DATABASE_URL_ADMIN;
  const version = option("--analysis-version") ?? process.env.RUJAK_ANALYSIS_VERSION ?? P0_VERSION;
  const postgisSchema = option("--postgis-schema") ?? process.env.RUJAK_POSTGIS_SCHEMA;
  if (!ANALYSIS_VERSION.test(version)) throw new Error("analysis_version must be a non-empty safe version identifier.");
  const inputs = await loadInputs(version);
  if (process.argv.includes("--require-all-approved")) {
    requireAllAccessQualityApproved(inputs.accessQuality);
  }
  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({
      analysis_version: version,
      validated: {
        transit_points: inputs.stopIds.size,
        culinary_poi: inputs.merchantIds.size,
        stop_merchant_access: inputs.access.features.length,
        stop_isochrones: inputs.isochrones.features.length,
      },
    }, null, 2));
    return;
  }
  required(databaseUrl, "Provide --database-url or DATABASE_URL_ADMIN.");
  required(postgisSchema, "Provide --postgis-schema or RUJAK_POSTGIS_SCHEMA.");
  const postgis = quoteIdentifier(postgisSchema, "RUJAK_POSTGIS_SCHEMA");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: "rujak-phase05-import" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await checkPostgis(client, postgisSchema);
    await insertCanonical(client, postgis, inputs);
    await importAnalytical(client, postgis, inputs, version);
    await importAccessQuality(client, inputs);
    const importedCounts = await counts(client, version);
    const expected = {
      transit_points: inputs.stopIds.size,
      culinary_poi: inputs.merchantIds.size,
      stop_snaps: inputs.stopIds.size,
      merchant_snaps: inputs.merchantIds.size,
      stop_merchant_access: inputs.stopIds.size * inputs.merchantIds.size,
      stop_isochrones: inputs.stopIds.size * 2,
      access_quality: inputs.stopIds.size,
    };
    for (const [table, count] of Object.entries(expected)) {
      if (Number(importedCounts[table]) !== count) throw new Error(`${table} imported count does not match source count.`);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ analysis_version: version, imported: expected }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
