import { ApiError, normalizeCategory, parseStopId } from "@/lib/server/api-contract";

export type AgusIntent = "reachable_food" | "nearest_food" | "filter_food_category" | "stop_access_info";
export type AgusInterpretation = AgusIntent | "unsupported" | "unrelated";

export type AgusRequest = {
  message: string;
  context: { selectedStopId: string | null; selectedMinutes: 5 | 10 | null };
};

export type AgusInterpretationOutput = {
  interpretation: AgusInterpretation;
  minutes?: 5 | 10;
  categoryL2?: string;
};

export type DiscoveryResultAction = {
  type: "discovery_result";
  stop_id: string;
  minutes: 5 | 10;
  category_l2: string | null;
  merchant_ids: string[];
  highlight_merchant_id: string | null;
  show_isochrone: true;
  fit_bounds: true;
};

export type AgusMapAction = DiscoveryResultAction;

export type AgusResponse = {
  status: "ok" | "limitation";
  assistant_text: string;
  intent: AgusIntent | "unsupported" | "unrelated" | null;
  reason: string | null;
  result: {
    stop_id?: string;
    minutes?: 5 | 10;
    category_l2?: string | null;
    merchant_ids?: string[];
    result_count?: number;
    analysis_version?: string;
    review_status?: "approved";
  } | null;
  map_action: AgusMapAction | null;
};

const merchantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", message);
  }
  return value as Record<string, unknown>;
}

export async function parseAgusRequest(request: Request): Promise<AgusRequest> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "Content-Type must be application/json.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  const record = object(body, "Request body must be a JSON object.");
  if (Object.keys(record).some((key) => key !== "message" && key !== "context")) {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "Request body contains unsupported fields.");
  }
  if (typeof record.message !== "string") {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "message is required.");
  }
  const message = record.message.normalize("NFKC").trim();
  if (!message || Array.from(message).length > 800) {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "message must contain 1 to 800 characters.");
  }
  const context = object(record.context, "context is required.");
  if (Object.keys(context).some((key) => key !== "selected_stop_id" && key !== "selected_minutes")) {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "context contains unsupported fields.");
  }
  if (context.selected_stop_id !== null && typeof context.selected_stop_id !== "string") {
    throw new ApiError(400, "AGUS_VALIDATION_ERROR", "context.selected_stop_id must be a stop_id or null.");
  }
  if (context.selected_minutes !== null && context.selected_minutes !== 5 && context.selected_minutes !== 10) {
    throw new ApiError(422, "AGUS_VALIDATION_ERROR", "context.selected_minutes must be 5, 10, or null.");
  }
  return {
    message,
    context: {
      selectedStopId: context.selected_stop_id === null ? null : parseStopId(context.selected_stop_id),
      selectedMinutes: context.selected_minutes as 5 | 10 | null,
    },
  };
}

export function validateInterpretation(value: unknown): AgusInterpretationOutput {
  const record = object(value, "Provider output must be an object.");
  if (Object.keys(record).some((key) => key !== "interpretation" && key !== "minutes" && key !== "category_l2")) {
    throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
  }
  const allowed = new Set<AgusInterpretation>(["reachable_food", "nearest_food", "filter_food_category", "stop_access_info", "unsupported", "unrelated"]);
  if (typeof record.interpretation !== "string" || !allowed.has(record.interpretation as AgusInterpretation)) {
    throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
  }
  if (record.minutes !== undefined && record.minutes !== 5 && record.minutes !== 10) {
    throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
  }
  if (record.category_l2 !== undefined && typeof record.category_l2 !== "string") {
    throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
  }
  return {
    interpretation: record.interpretation as AgusInterpretation,
    ...(record.minutes === undefined ? {} : { minutes: record.minutes as 5 | 10 }),
    ...(record.category_l2 === undefined ? {} : { categoryL2: normalizeCategory(record.category_l2) }),
  };
}

export function validateDiscoveryAction(action: AgusMapAction): AgusMapAction {
  if (action.type !== "discovery_result" || !action.stop_id || (action.minutes !== 5 && action.minutes !== 10)
    || (action.category_l2 !== null && typeof action.category_l2 !== "string")
    || !Array.isArray(action.merchant_ids) || action.merchant_ids.some((id) => typeof id !== "string" || !merchantIdPattern.test(id))
    || new Set(action.merchant_ids).size !== action.merchant_ids.length
    || (action.highlight_merchant_id !== null && (!merchantIdPattern.test(action.highlight_merchant_id) || !action.merchant_ids.includes(action.highlight_merchant_id)))
    || action.show_isochrone !== true || action.fit_bounds !== true) {
    throw new ApiError(500, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS produced an unsafe map action.");
  }
  return action;
}
