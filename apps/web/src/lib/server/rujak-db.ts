import "server-only";

import { Pool, type QueryResultRow } from "pg";
import { parseGeometryText, type GeoJsonGeometry } from "@/lib/server/geometry-wkt";

export type { GeoJsonGeometry } from "@/lib/server/geometry-wkt";

export class AnalyticalDataUnavailableError extends Error {}
export class DatabaseQueryError extends Error {
  constructor(public readonly operation: string, cause: unknown) {
    super(`Database operation failed during ${operation}.`, { cause });
  }
}

type RuntimeConfig = {
  analysisVersion: string;
  postgisSchema: string;
  runtimeUrl: string;
};

let pool: Pool | undefined;
let config: RuntimeConfig | undefined;
let postgisVerification: Promise<void> | undefined;

function configuredIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${name} must be a PostgreSQL identifier.`);
  }
  return value;
}

export function runtimeConfig(): RuntimeConfig {
  if (config) {
    return config;
  }

  const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
  const analysisVersion = process.env.RUJAK_ANALYSIS_VERSION;
  const postgisSchema = process.env.RUJAK_POSTGIS_SCHEMA;
  if (!runtimeUrl || !analysisVersion || !postgisSchema) {
    throw new Error("Server database configuration is incomplete.");
  }

  config = {
    runtimeUrl,
    analysisVersion,
    postgisSchema: configuredIdentifier(postgisSchema, "RUJAK_POSTGIS_SCHEMA"),
  };
  return config;
}

function runtimePool(): Pool {
  const settings = runtimeConfig();
  if (!pool) {
    pool = new Pool({
      connectionString: settings.runtimeUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      application_name: "rujak-next-runtime",
    });
  }
  return pool;
}

async function verifyPostgisInstallation(): Promise<void> {
  if (!postgisVerification) {
    const settings = runtimeConfig();
    postgisVerification = runtimePool()
      .query<{ schema_name: string }>(
        `SELECT namespace.nspname AS schema_name
           FROM pg_extension AS extension
           JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
          WHERE extension.extname = 'postgis'`,
      )
      .then((result) => {
        if (result.rowCount !== 1 || result.rows[0].schema_name !== settings.postgisSchema) {
          throw new Error("Configured PostGIS schema does not match the installed extension.");
        }
      });
  }
  await postgisVerification;
}

export async function query<Row extends QueryResultRow>(text: string, values: unknown[] = [], operation = "database query") {
  try {
    await verifyPostgisInstallation();
    return await runtimePool().query<Row>(text, values);
  } catch (cause) {
    throw new DatabaseQueryError(operation, cause);
  }
}

export type StopSummary = {
  stop_id: string;
  stop_name: string;
  geometry: GeoJsonGeometry;
  source: string;
  validation_status: string;
  scope: string;
};

export async function listStops(): Promise<StopSummary[]> {
  const result = await query<StopSummary & { geometry_json: unknown }>(`
    SELECT stop_id, stop_name, geometry::text AS geometry_json,
           source, validation_status, scope
      FROM rujak.transit_points
     ORDER BY stop_name ASC, stop_id ASC`, [], "list stops");
  return result.rows.map(({ geometry_json, ...stop }) => ({ ...stop, geometry: parseGeometryText(geometry_json) }));
}

export type StopDetail = StopSummary & {
  description_raw: string | null;
  surveyed_at: string | null;
  surveyor: string | null;
  media: unknown;
  access_quality: {
    evidence_text: string | null;
    review_status: string;
    shelter: string | null;
    seating: string | null;
    pedestrian_condition: string | null;
    cleanliness: string | null;
    traffic_condition: string | null;
  } | null;
};

export async function getStopDetail(stopId: string): Promise<StopDetail | null> {
  const result = await query<{
    stop_id: string;
    stop_name: string;
    geometry_json: unknown;
    source: string;
    validation_status: string;
    scope: string;
    description_raw: string | null;
    surveyed_at: string | null;
    surveyor: string | null;
    media: unknown;
    evidence_text: string | null;
    review_status: string | null;
    shelter: string | null;
    seating: string | null;
    pedestrian_condition: string | null;
    cleanliness: string | null;
    traffic_condition: string | null;
  }>(`
    SELECT transit.stop_id, transit.stop_name, transit.geometry::text AS geometry_json,
           transit.source, transit.validation_status, transit.scope, transit.description_raw,
           transit.surveyed_at, transit.surveyor, transit.media,
           quality.evidence_text, quality.review_status,
           CASE WHEN quality.review_status = 'approved' THEN quality.shelter END AS shelter,
           CASE WHEN quality.review_status = 'approved' THEN quality.seating END AS seating,
           CASE WHEN quality.review_status = 'approved' THEN quality.pedestrian_condition END AS pedestrian_condition,
           CASE WHEN quality.review_status = 'approved' THEN quality.cleanliness END AS cleanliness,
           CASE WHEN quality.review_status = 'approved' THEN quality.traffic_condition END AS traffic_condition
      FROM rujak.transit_points AS transit
      LEFT JOIN rujak.access_quality AS quality ON quality.stop_id = transit.stop_id
     WHERE transit.stop_id = $1`, [stopId], "get stop detail");

  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const { geometry_json, review_status, evidence_text, shelter, seating, pedestrian_condition, cleanliness, traffic_condition, ...stop } = row;
  return {
    ...stop,
    geometry: parseGeometryText(geometry_json),
    access_quality: review_status
      ? { evidence_text, review_status, shelter, seating, pedestrian_condition, cleanliness, traffic_condition }
      : null,
  };
}

export type MerchantDetail = {
  merchant_id: string;
  merchant_name: string;
  category_l1: string | null;
  category_l2: string | null;
  category_l3: string | null;
  phone: string | null;
  address: string | null;
  district: string | null;
  village: string | null;
  status: string | null;
  collected_at: string | null;
  updated_at: string | null;
  source: string;
  validation_status: string;
  geometry: GeoJsonGeometry;
};

export async function getMerchantDetail(merchantId: string): Promise<MerchantDetail | null> {
  const result = await query<MerchantDetail & { geometry_json: unknown }>(`
    SELECT merchant_id::text, merchant_name, category_l1, category_l2, category_l3,
           phone, address, district, village, status, collected_at, updated_at,
           source, validation_status, geometry::text AS geometry_json
      FROM rujak.culinary_poi
     WHERE merchant_id = $1::uuid`, [merchantId], "get merchant detail");
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const { geometry_json, ...merchant } = row;
  return { ...merchant, geometry: parseGeometryText(geometry_json) };
}

export type ActiveStopState = { stop_name: string; routing_status: string | null };

export async function getActiveStopState(stopId: string): Promise<ActiveStopState | null> {
  const settings = runtimeConfig();
  const result = await query<ActiveStopState>(`
    SELECT transit.stop_name, snap.routing_status
      FROM rujak.transit_points AS transit
      LEFT JOIN rujak.stop_snaps AS snap
        ON snap.stop_id = transit.stop_id AND snap.analysis_version = $2
     WHERE transit.stop_id = $1`, [stopId, settings.analysisVersion], "get active stop state");
  return result.rows[0] ?? null;
}

export type Isochrone = { stop_id: string; duration_min: number; geometry: GeoJsonGeometry; method: string; analysis_version: string };

export async function getIsochrone(stopId: string, duration: 5 | 10): Promise<Isochrone | null> {
  const settings = runtimeConfig();
  const result = await query<Isochrone & { geometry_json: unknown }>(`
    SELECT stop_id, duration_min, method, analysis_version,
           geometry::text AS geometry_json
      FROM rujak.stop_isochrones
     WHERE stop_id = $1 AND duration_min = $2 AND analysis_version = $3`,
    [stopId, duration, settings.analysisVersion], "get stop isochrone");
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const { geometry_json, ...isochrone } = row;
  return { ...isochrone, geometry: parseGeometryText(geometry_json) };
}

export type DiscoveryRow = {
  merchant_id: string;
  merchant_name: string;
  category_l1: string | null;
  category_l2: string | null;
  category_l3: string | null;
  address: string | null;
  geometry: GeoJsonGeometry;
  walking_distance_m: number;
  walking_time_min: number;
};

type DiscoveryQueryRow = Omit<DiscoveryRow, "geometry"> & { geometry_json: unknown };

export function parseDiscoveryRows(rows: DiscoveryQueryRow[]): DiscoveryRow[] {
  return rows.map(({ geometry_json, ...merchant }) => {
    const geometry = parseGeometryText(geometry_json);
    if (geometry.type !== "Point") {
      throw new AnalyticalDataUnavailableError("Canonical merchant geometry must be a Point.");
    }
    return { ...merchant, geometry };
  });
}

export async function assertCompleteAccess(stopId: string): Promise<void> {
  const settings = runtimeConfig();
  const result = await query<{ access_count: string; merchant_count: string }>(`
    SELECT COUNT(access.merchant_id)::text AS access_count,
           (SELECT COUNT(*) FROM rujak.culinary_poi)::text AS merchant_count
      FROM rujak.stop_merchant_access AS access
     WHERE access.stop_id = $1 AND access.analysis_version = $2`, [stopId, settings.analysisVersion], "check complete discovery access");
  const row = result.rows[0];
  if (!row || row.access_count !== row.merchant_count) {
    throw new AnalyticalDataUnavailableError("Active analysis data is incomplete.");
  }
}

export async function discoverMerchants(stopId: string, maxWalkTime: 5 | 10, category: string | null): Promise<DiscoveryRow[]> {
  const settings = runtimeConfig();
  const reachabilityColumn = maxWalkTime === 5 ? "reachable_5min" : "reachable_10min";
  const categoryClause = category
    ? `AND (
      UPPER(REGEXP_REPLACE(TRIM(COALESCE(merchant.category_l1, '')), '\\s+', ' ', 'g')) = $3
      OR UPPER(REGEXP_REPLACE(TRIM(COALESCE(merchant.category_l2, '')), '\\s+', ' ', 'g')) = $3
      OR UPPER(REGEXP_REPLACE(TRIM(COALESCE(merchant.category_l3, '')), '\\s+', ' ', 'g')) = $3
    )`
    : "";
  const values = category ? [stopId, settings.analysisVersion, category] : [stopId, settings.analysisVersion];
  const result = await query<DiscoveryQueryRow>(`
    SELECT merchant.merchant_id::text AS merchant_id, merchant.merchant_name,
           merchant.category_l1, merchant.category_l2, merchant.category_l3,
           merchant.address, merchant.geometry::text AS geometry_json,
           access.total_distance_m AS walking_distance_m,
           access.walking_time_min
      FROM rujak.stop_merchant_access AS access
      JOIN rujak.culinary_poi AS merchant ON merchant.merchant_id = access.merchant_id
     WHERE access.stop_id = $1
       AND access.analysis_version = $2
       AND access.${reachabilityColumn} IS TRUE
       ${categoryClause}
     ORDER BY access.walking_time_seconds ASC, merchant.merchant_id ASC`, values, "discover merchants");
  return parseDiscoveryRows(result.rows);
}

export async function listCategoryL2(): Promise<string[]> {
  const result = await query<{ category_l2: string }>(`
    SELECT DISTINCT TRIM(category_l2) AS category_l2
      FROM rujak.culinary_poi
     WHERE category_l2 IS NOT NULL AND TRIM(category_l2) <> ''
     ORDER BY category_l2 ASC`, [], "list canonical category_l2 values");
  return result.rows.map((row) => row.category_l2);
}
