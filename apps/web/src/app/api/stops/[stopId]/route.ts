import { ApiError, parseStopId, withApiRoute } from "@/lib/server/api-contract";
import { getStopDetail } from "@/lib/server/rujak-db";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/stops/[stopId]">) {
  const { stopId: rawStopId } = await context.params;
  return withApiRoute(request, "GET /api/stops/:stopId", { stopId: rawStopId }, async ({ setResultCount }) => {
    const stopId = parseStopId(rawStopId);
    const stop = await getStopDetail(stopId);
    if (!stop) {
      throw new ApiError(404, "STOP_NOT_FOUND", "The requested stop was not found.");
    }
    setResultCount(1);
    return { stop };
  });
}
