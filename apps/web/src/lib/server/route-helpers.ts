import "server-only";

import { ApiError } from "@/lib/server/api-contract";
import {
  AnalyticalDataUnavailableError,
  assertCompleteAccess,
  getActiveStopState,
} from "@/lib/server/rujak-db";

export async function requireRoutableStop(stopId: string): Promise<{ stopName: string }> {
  const state = await getActiveStopState(stopId);
  if (!state) {
    throw new ApiError(404, "STOP_NOT_FOUND", "The requested stop was not found.");
  }
  if (!state.routing_status) {
    throw new ApiError(503, "ANALYSIS_DATA_UNAVAILABLE", "Active analytical data is unavailable for this stop.");
  }
  if (state.routing_status !== "routable") {
    throw new ApiError(409, "STOP_UNROUTABLE", "The requested stop is not routable in the active analysis.");
  }
  return { stopName: state.stop_name };
}

export async function requireCompleteDiscoveryAccess(stopId: string): Promise<void> {
  try {
    await assertCompleteAccess(stopId);
  } catch (error) {
    if (error instanceof AnalyticalDataUnavailableError) {
      throw new ApiError(503, "ANALYSIS_DATA_UNAVAILABLE", "Active analytical data is incomplete for this stop.");
    }
    throw error;
  }
}
