import type { DiscoveryResponse, DiscoveryResultAction, StopSummary } from "@/lib/client/rujak-types";

const merchantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAgusActionStageOne(value: unknown, stops: StopSummary[]): DiscoveryResultAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = value as Partial<DiscoveryResultAction>;
  if (action.type !== "discovery_result" || typeof action.stop_id !== "string" || !stops.some((stop) => stop.stop_id === action.stop_id)
    || (action.minutes !== 5 && action.minutes !== 10) || (action.category_l2 !== null && typeof action.category_l2 !== "string")
    || !Array.isArray(action.merchant_ids) || action.merchant_ids.some((id) => typeof id !== "string" || !merchantIdPattern.test(id))
    || new Set(action.merchant_ids).size !== action.merchant_ids.length
    || (action.highlight_merchant_id !== null && (typeof action.highlight_merchant_id !== "string" || !merchantIdPattern.test(action.highlight_merchant_id) || !action.merchant_ids.includes(action.highlight_merchant_id)))
    || action.show_isochrone !== true || action.fit_bounds !== true) return null;
  return action as DiscoveryResultAction;
}

export function validateAgusActionStageTwo(action: DiscoveryResultAction, discovery: DiscoveryResponse): boolean {
  if (discovery.stop.stop_id !== action.stop_id || discovery.criteria.max_walk_time !== action.minutes || discovery.criteria.category !== action.category_l2) return false;
  const fetchedIds = discovery.results.map((merchant) => merchant.merchant_id);
  return fetchedIds.length === action.merchant_ids.length
    && fetchedIds.every((merchantId, index) => merchantId === action.merchant_ids[index])
    && (action.highlight_merchant_id === null || fetchedIds.includes(action.highlight_merchant_id));
}
