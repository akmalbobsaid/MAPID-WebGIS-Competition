export type GeoJsonGeometry = {
  type: "Point" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stripOuterParentheses(value: string): string {
  const text = value.trim();
  assert(text.startsWith("(") && text.endsWith(")"), "Geometry text has unbalanced parentheses.");
  return text.slice(1, -1).trim();
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    assert(depth >= 0, "Geometry text has unbalanced parentheses.");
    if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  assert(depth === 0, "Geometry text has unbalanced parentheses.");
  parts.push(value.slice(start).trim());
  assert(parts.every(Boolean), "Geometry text has an empty coordinate component.");
  return parts;
}

function position(value: string): [number, number] {
  const coordinates = value.trim().split(/\s+/u).map(Number);
  assert(coordinates.length === 2 && coordinates.every(Number.isFinite), "Geometry text must contain finite two-dimensional positions.");
  return [coordinates[0], coordinates[1]];
}

function ring(value: string): [number, number][] {
  const coordinates = splitTopLevel(stripOuterParentheses(value)).map(position);
  assert(coordinates.length >= 4, "Polygon ring has too few positions.");
  assert(coordinates[0][0] === coordinates.at(-1)?.[0] && coordinates[0][1] === coordinates.at(-1)?.[1], "Polygon ring is not closed.");
  return coordinates;
}

function polygon(value: string): [number, number][][] {
  return splitTopLevel(stripOuterParentheses(value)).map(ring);
}

function parseWkt(value: string): GeoJsonGeometry {
  const text = value.trim().replace(/^SRID=\d+;/iu, "");
  const match = /^(POINT|POLYGON|MULTIPOLYGON)\s*(\(.*\))$/iu.exec(text);
  assert(match, "Database returned unsupported geometry text.");
  const type = match[1].toUpperCase();
  if (type === "POINT") return { type: "Point", coordinates: position(stripOuterParentheses(match[2])) };
  if (type === "POLYGON") return { type: "Polygon", coordinates: polygon(match[2]) };
  return { type: "MultiPolygon", coordinates: splitTopLevel(stripOuterParentheses(match[2])).map(polygon) };
}

function parseEwkb(value: string): GeoJsonGeometry {
  assert(/^[0-9a-f]+$/iu.test(value) && value.length % 2 === 0, "Database returned invalid EWKB geometry text.");
  const bytes = Buffer.from(value, "hex");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readGeometry = (): GeoJsonGeometry => {
    assert(offset + 5 <= view.byteLength, "EWKB geometry is truncated.");
    const littleEndian = view.getUint8(offset) === 1;
    assert(littleEndian || view.getUint8(offset) === 0, "EWKB byte order is invalid.");
    offset += 1;
    const encodedType = view.getUint32(offset, littleEndian);
    offset += 4;
    const hasZ = (encodedType & 0x80000000) !== 0;
    const hasM = (encodedType & 0x40000000) !== 0;
    const hasSrid = (encodedType & 0x20000000) !== 0;
    const baseType = encodedType & 0x0fffffff;
    if (hasSrid) {
      assert(offset + 4 <= view.byteLength, "EWKB SRID is truncated.");
      offset += 4;
    }
    const dimensions = 2 + Number(hasZ) + Number(hasM);
    const readPosition = (): [number, number] => {
      assert(offset + (dimensions * 8) <= view.byteLength, "EWKB position is truncated.");
      const x = view.getFloat64(offset, littleEndian);
      const y = view.getFloat64(offset + 8, littleEndian);
      offset += dimensions * 8;
      assert(Number.isFinite(x) && Number.isFinite(y), "EWKB position is not finite.");
      return [x, y];
    };
    const readCount = (): number => {
      assert(offset + 4 <= view.byteLength, "EWKB collection count is truncated.");
      const count = view.getUint32(offset, littleEndian);
      offset += 4;
      return count;
    };
    const readRing = (): [number, number][] => {
      const coordinates = Array.from({ length: readCount() }, readPosition);
      assert(coordinates.length >= 4, "EWKB polygon ring has too few positions.");
      assert(coordinates[0][0] === coordinates.at(-1)?.[0] && coordinates[0][1] === coordinates.at(-1)?.[1], "EWKB polygon ring is not closed.");
      return coordinates;
    };

    if (baseType === 1) return { type: "Point", coordinates: readPosition() };
    if (baseType === 3) return { type: "Polygon", coordinates: Array.from({ length: readCount() }, readRing) };
    if (baseType === 6) {
      const polygons = Array.from({ length: readCount() }, () => readGeometry());
      assert(polygons.every((geometry) => geometry.type === "Polygon"), "EWKB MultiPolygon contains a non-polygon geometry.");
      return { type: "MultiPolygon", coordinates: polygons.map((geometry) => geometry.coordinates) };
    }
    throw new Error("Database returned unsupported EWKB geometry type.");
  };

  const geometry = readGeometry();
  assert(offset === view.byteLength, "EWKB geometry has trailing bytes.");
  return geometry;
}

function isGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  return !!value && typeof value === "object" && "type" in value && "coordinates" in value
    && ["Point", "Polygon", "MultiPolygon"].includes(String(value.type));
}

export function parseGeometryText(value: unknown): GeoJsonGeometry {
  if (isGeoJsonGeometry(value)) return value;
  if (typeof value !== "string") throw new Error("Database returned invalid geometry.");
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isGeoJsonGeometry(parsed)) return parsed;
  } catch {
    // PostGIS geometry output is EWKT/WKT for the runtime role's text query.
  }
  if (/^[0-9a-f]+$/iu.test(value)) return parseEwkb(value);
  return parseWkt(value);
}
import { Buffer } from "node:buffer";
