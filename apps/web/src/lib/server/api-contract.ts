export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "STOP_NOT_FOUND"
  | "INVALID_MERCHANT_ID"
  | "MERCHANT_NOT_FOUND"
  | "UNSUPPORTED_WALK_THRESHOLD"
  | "UNSUPPORTED_ISOCHRONE_DURATION"
  | "STOP_UNROUTABLE"
  | "ANALYSIS_DATA_UNAVAILABLE"
  | "AGUS_VALIDATION_ERROR"
  | "STOP_CONTEXT_REQUIRED"
  | "STOP_ACCESS_REVIEW_UNAVAILABLE"
  | "AGUS_PROVIDER_UNAVAILABLE"
  | "AGUS_INTERPRETATION_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type ApiRouteContext = {
  requestId: string;
  setResultCount: (count: number) => void;
  setLogMetadata: (metadata: Record<string, string | number | null>) => void;
};

const stopIdPattern = /^[0-9a-f]{24}$/;
const merchantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestIdFrom(request: Request): string {
  const requested = request.headers.get("x-request-id");
  if (requested && /^[A-Za-z0-9._-]{1,96}$/.test(requested)) {
    return requested;
  }
  return crypto.randomUUID();
}

function toPublicError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(500, "INTERNAL_ERROR", "The server could not complete the request.");
}

function developmentDiagnostic(error: unknown): Record<string, string> {
  if (process.env.NODE_ENV === "production" || !error || typeof error !== "object") return {};
  const candidate = error as { operation?: unknown; cause?: unknown };
  const cause = candidate.cause as { code?: unknown; message?: unknown } | undefined;
  const diagnostic: Record<string, string> = {};
  if (typeof candidate.operation === "string") diagnostic.operation = candidate.operation;
  if (typeof cause?.code === "string" && /^[0-9A-Z]{5}$/u.test(cause.code)) diagnostic.pgCode = cause.code;
  if (typeof cause?.message === "string") {
    diagnostic.pgMessage = cause.message.replace(/[\r\n]+/gu, " ").replace(/postgres(?:ql)?:\/\/\S+/giu, "[redacted]").slice(0, 240);
  }
  return diagnostic;
}

export async function withApiRoute(
  request: Request,
  endpoint: string,
  metadata: Record<string, unknown>,
  handler: (context: ApiRouteContext) => Promise<unknown>,
): Promise<Response> {
  const requestId = requestIdFrom(request);
  const startedAt = performance.now();
  let resultCount: number | undefined;
  let logMetadata: Record<string, string | number | null> = {};

  try {
    const body = await handler({
      requestId,
      setResultCount: (count) => {
        resultCount = count;
      },
      setLogMetadata: (fields) => {
        const allowed = new Set(["intent", "stopId", "minutes", "category", "providerErrorCategory", "validationFailureCategory"]);
        logMetadata = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.has(key)));
      },
    });
    logRequest({
      requestId,
      endpoint,
      ...metadata,
      ...logMetadata,
      analysisVersion: process.env.RUJAK_ANALYSIS_VERSION ?? null,
      resultCount,
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return Response.json(body, { headers: { "x-request-id": requestId } });
  } catch (error) {
    const publicError = toPublicError(error);
    logRequest({
      requestId,
      endpoint,
      ...metadata,
      ...logMetadata,
      analysisVersion: process.env.RUJAK_ANALYSIS_VERSION ?? null,
      errorCategory: publicError.code,
      ...developmentDiagnostic(error),
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return Response.json(
      {
        error: {
          code: publicError.code,
          message: publicError.message,
          request_id: requestId,
          ...(publicError.details ? { details: publicError.details } : {}),
        },
      },
      { status: publicError.status, headers: { "x-request-id": requestId } },
    );
  }
}

function logRequest(event: Record<string, unknown>): void {
  console.info(JSON.stringify({ event: "rujak_api_request", ...event }));
}

export function parseStopId(value: string): string {
  if (!stopIdPattern.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "stop_id must be a 24-character hexadecimal identifier.");
  }
  return value.toLowerCase();
}

export function parseMerchantId(value: string): string {
  if (!merchantIdPattern.test(value)) {
    throw new ApiError(400, "INVALID_MERCHANT_ID", "merchant_id must be a UUID.");
  }
  return value.toLowerCase();
}

export function parseDuration(value: string | null): 5 | 10 {
  if (value !== "5" && value !== "10") {
    throw new ApiError(422, "UNSUPPORTED_ISOCHRONE_DURATION", "Only 5 and 10 minute isochrones are supported.");
  }
  return Number(value) as 5 | 10;
}

export function normalizeCategory(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("id-ID");
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", "category must be null or a non-empty string.");
  }
  return normalized;
}

export type DiscoveryRequest = {
  stopId: string;
  maxWalkTime: 5 | 10;
  category: string | null;
};

export async function parseDiscoveryRequest(request: Request): Promise<DiscoveryRequest> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Content-Type must be application/json.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }

  const record = body as Record<string, unknown>;
  const allowed = new Set(["stop_id", "max_walk_time", "category"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body contains unsupported fields.");
  }
  if (typeof record.stop_id !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "stop_id is required.");
  }
  if (record.max_walk_time !== 5 && record.max_walk_time !== 10) {
    throw new ApiError(422, "UNSUPPORTED_WALK_THRESHOLD", "Only 5 and 10 minute walking thresholds are supported.");
  }
  if (record.category !== null && typeof record.category !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "category must be null or a string.");
  }

  return {
    stopId: parseStopId(record.stop_id),
    maxWalkTime: record.max_walk_time,
    category: record.category === null ? null : normalizeCategory(record.category),
  };
}
