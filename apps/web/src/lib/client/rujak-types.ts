export type Position = [number, number];

export type PointGeometry = { type: "Point"; coordinates: Position };
export type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
export type GeoJsonGeometry = PointGeometry | PolygonGeometry | MultiPolygonGeometry;

export type StopSummary = {
  stop_id: string;
  stop_name: string;
  geometry: PointGeometry;
  source: string;
  validation_status: string;
  scope: string;
};

export type AccessQuality = {
  evidence_text: string | null;
  review_status: string;
  shelter: string | null;
  seating: string | null;
  pedestrian_condition: string | null;
  cleanliness: string | null;
  traffic_condition: string | null;
};

export type StopDetail = StopSummary & {
  description_raw: string | null;
  surveyed_at: string | null;
  surveyor: string | null;
  media: unknown;
  access_quality: AccessQuality | null;
};

export type MerchantResult = {
  merchant_id: string;
  merchant_name: string;
  category_l1: string | null;
  category_l2: string | null;
  category_l3: string | null;
  address: string | null;
  geometry: PointGeometry;
  walking_distance_m: number;
  walking_time_min: number;
};

export type MerchantDetail = Omit<MerchantResult, "walking_distance_m" | "walking_time_min"> & {
  phone: string | null;
  district: string | null;
  village: string | null;
  status: string | null;
  collected_at: string | null;
  updated_at: string | null;
  source: string;
  validation_status: string;
};

export type Isochrone = {
  stop_id: string;
  duration_min: 5 | 10;
  geometry: PolygonGeometry | MultiPolygonGeometry;
  method: string;
  analysis_version: string;
};

export type DiscoveryResponse = {
  stop: { stop_id: string; stop_name: string };
  criteria: { max_walk_time: 5 | 10; category: string | null };
  results: MerchantResult[];
  analysis_version: string;
};
