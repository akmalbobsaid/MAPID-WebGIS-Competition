-- PHASE-05 database contract. Apply only with DATABASE_URL_ADMIN after the
-- Supabase project has PostGIS and the rujak_runtime role provisioned.
-- This migration never creates, moves, or assumes the PostGIS extension schema.

DO $$
DECLARE
  postgis_schema text;
BEGIN
  SELECT namespace.nspname
    INTO postgis_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'postgis';

  IF postgis_schema IS NULL THEN
    RAISE EXCEPTION 'PostGIS extension is not enabled; enable it in the agreed Supabase schema before applying PHASE-05.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rujak_runtime') THEN
    RAISE EXCEPTION 'Required least-privileged rujak_runtime role is not provisioned.';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS rujak;
REVOKE ALL ON SCHEMA rujak FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA rujak FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE rujak.transit_points (
  stop_id text PRIMARY KEY,
  stop_name text NOT NULL,
  description_raw text,
  surveyed_at timestamptz,
  surveyor text,
  media jsonb,
  source text NOT NULL,
  validation_status text NOT NULL,
  scope text NOT NULL
);

CREATE TABLE rujak.culinary_poi (
  merchant_id uuid PRIMARY KEY,
  merchant_name text NOT NULL,
  category_l1 text,
  category_l2 text,
  category_l3 text,
  phone text,
  address text,
  district text,
  village text,
  status text,
  collected_at text,
  updated_at text,
  source text NOT NULL,
  validation_status text NOT NULL
);

CREATE TABLE rujak.stop_snaps (
  stop_id text NOT NULL REFERENCES rujak.transit_points(stop_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  analysis_version text NOT NULL,
  node_id text NOT NULL,
  snap_distance_m double precision NOT NULL CHECK (snap_distance_m >= 0),
  routing_status text NOT NULL,
  PRIMARY KEY (stop_id, analysis_version)
);

CREATE TABLE rujak.merchant_snaps (
  merchant_id uuid NOT NULL REFERENCES rujak.culinary_poi(merchant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  analysis_version text NOT NULL,
  node_id text NOT NULL,
  snap_distance_m double precision NOT NULL CHECK (snap_distance_m >= 0),
  routing_status text NOT NULL,
  PRIMARY KEY (merchant_id, analysis_version)
);

CREATE TABLE rujak.stop_merchant_access (
  stop_id text NOT NULL REFERENCES rujak.transit_points(stop_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  merchant_id uuid NOT NULL REFERENCES rujak.culinary_poi(merchant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  analysis_version text NOT NULL,
  network_distance_m double precision,
  total_distance_m double precision,
  walking_time_seconds double precision,
  walking_time_min double precision,
  reachable_5min boolean,
  reachable_10min boolean,
  routing_status text NOT NULL,
  PRIMARY KEY (stop_id, merchant_id, analysis_version),
  CONSTRAINT stop_merchant_access_nonnegative CHECK (
    (network_distance_m IS NULL OR (network_distance_m >= 0 AND network_distance_m < 'Infinity'::double precision))
    AND (total_distance_m IS NULL OR (total_distance_m >= 0 AND total_distance_m < 'Infinity'::double precision))
    AND (walking_time_seconds IS NULL OR (walking_time_seconds >= 0 AND walking_time_seconds < 'Infinity'::double precision))
    AND (walking_time_min IS NULL OR (walking_time_min >= 0 AND walking_time_min < 'Infinity'::double precision))
  ),
  CONSTRAINT stop_merchant_access_connector_total CHECK (
    network_distance_m IS NULL OR total_distance_m IS NULL OR total_distance_m >= network_distance_m
  ),
  CONSTRAINT stop_merchant_access_time_units CHECK (
    walking_time_seconds IS NULL OR walking_time_min IS NULL
    OR abs((walking_time_min * 60) - walking_time_seconds) < 0.000001
  ),
  CONSTRAINT stop_merchant_access_nested_thresholds CHECK (
    reachable_5min IS DISTINCT FROM true OR reachable_10min IS true
  ),
  CONSTRAINT stop_merchant_access_routable_facts CHECK (
    (routing_status = 'routable' AND network_distance_m IS NOT NULL AND total_distance_m IS NOT NULL
      AND walking_time_seconds IS NOT NULL AND walking_time_min IS NOT NULL
      AND reachable_5min IS NOT NULL AND reachable_10min IS NOT NULL)
    OR
    (routing_status <> 'routable' AND network_distance_m IS NULL AND total_distance_m IS NULL
      AND walking_time_seconds IS NULL AND walking_time_min IS NULL
      AND reachable_5min IS NULL AND reachable_10min IS NULL)
  )
);

CREATE TABLE rujak.stop_isochrones (
  stop_id text NOT NULL REFERENCES rujak.transit_points(stop_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  duration_min smallint NOT NULL CHECK (duration_min IN (5, 10)),
  method text NOT NULL,
  analysis_version text NOT NULL,
  PRIMARY KEY (stop_id, duration_min, analysis_version)
);

CREATE TABLE rujak.access_quality (
  stop_id text PRIMARY KEY REFERENCES rujak.transit_points(stop_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  evidence_text text,
  shelter text,
  seating text,
  pedestrian_condition text,
  cleanliness text,
  traffic_condition text,
  review_status text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz
);

DO $$
DECLARE
  postgis_schema text;
BEGIN
  SELECT namespace.nspname
    INTO postgis_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'postgis';

  EXECUTE format(
    'ALTER TABLE rujak.transit_points ADD COLUMN geometry %1$I.geometry(Point, 4326) NOT NULL, ADD CONSTRAINT transit_points_geometry_valid CHECK (%1$I.ST_IsValid(geometry) AND NOT %1$I.ST_IsEmpty(geometry));
     ALTER TABLE rujak.culinary_poi ADD COLUMN geometry %1$I.geometry(Point, 4326) NOT NULL, ADD CONSTRAINT culinary_poi_geometry_valid CHECK (%1$I.ST_IsValid(geometry) AND NOT %1$I.ST_IsEmpty(geometry));
     ALTER TABLE rujak.stop_merchant_access ADD COLUMN path_geometry %1$I.geometry(LineString, 4326), ADD CONSTRAINT stop_merchant_access_path_geometry_valid CHECK (path_geometry IS NULL OR (%1$I.ST_IsValid(path_geometry) AND NOT %1$I.ST_IsEmpty(path_geometry)));
     ALTER TABLE rujak.stop_isochrones ADD COLUMN geometry %1$I.geometry(Geometry, 4326) NOT NULL, ADD CONSTRAINT stop_isochrones_geometry_valid CHECK (%1$I.ST_IsValid(geometry) AND NOT %1$I.ST_IsEmpty(geometry) AND %1$I.ST_GeometryType(geometry) IN (''ST_Polygon'', ''ST_MultiPolygon''));
     CREATE INDEX transit_points_geometry_gix ON rujak.transit_points USING gist (geometry);
     CREATE INDEX culinary_poi_geometry_gix ON rujak.culinary_poi USING gist (geometry);
     CREATE INDEX stop_isochrones_geometry_gix ON rujak.stop_isochrones USING gist (geometry);',
    postgis_schema
  );
END;
$$;

CREATE INDEX stop_snaps_analysis_version_idx ON rujak.stop_snaps (analysis_version);
CREATE INDEX merchant_snaps_analysis_version_idx ON rujak.merchant_snaps (analysis_version);
CREATE INDEX stop_merchant_access_merchant_version_idx ON rujak.stop_merchant_access (merchant_id, analysis_version);
CREATE INDEX stop_merchant_access_discovery_5_idx ON rujak.stop_merchant_access (analysis_version, stop_id, reachable_5min, walking_time_seconds);
CREATE INDEX stop_merchant_access_discovery_10_idx ON rujak.stop_merchant_access (analysis_version, stop_id, reachable_10min, walking_time_seconds);
CREATE INDEX stop_isochrones_analysis_version_idx ON rujak.stop_isochrones (analysis_version);

REVOKE ALL ON ALL TABLES IN SCHEMA rujak FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA rujak FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rujak FROM PUBLIC;
GRANT USAGE ON SCHEMA rujak TO rujak_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA rujak TO rujak_runtime;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA rujak FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA rujak FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rujak FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
