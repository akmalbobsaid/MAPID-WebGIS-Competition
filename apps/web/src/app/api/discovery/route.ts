import { parseDiscoveryRequest, withApiRoute } from "@/lib/server/api-contract";
import { requireCompleteDiscoveryAccess, requireRoutableStop } from "@/lib/server/route-helpers";
import { discoverMerchants, runtimeConfig } from "@/lib/server/rujak-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApiRoute(request, "POST /api/discovery", {}, async ({ setResultCount }) => {
    const criteria = await parseDiscoveryRequest(request);
    const stop = await requireRoutableStop(criteria.stopId);
    await requireCompleteDiscoveryAccess(criteria.stopId);
    const results = await discoverMerchants(criteria.stopId, criteria.maxWalkTime, criteria.category);
    setResultCount(results.length);
    return {
      stop: { stop_id: criteria.stopId, stop_name: stop.stopName },
      criteria: { max_walk_time: criteria.maxWalkTime, category: criteria.category },
      results,
      analysis_version: runtimeConfig().analysisVersion,
    };
  });
}
