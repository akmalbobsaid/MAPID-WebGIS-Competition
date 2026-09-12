import { ApiError, parseDuration, parseStopId, withApiRoute } from "@/lib/server/api-contract";
import { requireRoutableStop } from "@/lib/server/route-helpers";
import { getIsochrone } from "@/lib/server/rujak-db";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/stops/[stopId]/isochrones">) {
  const { stopId: rawStopId } = await context.params;
  return withApiRoute(request, "GET /api/stops/:stopId/isochrones", { stopId: rawStopId }, async ({ setResultCount }) => {
    const stopId = parseStopId(rawStopId);
    const duration = parseDuration(new URL(request.url).searchParams.get("minutes"));
    await requireRoutableStop(stopId);
    const isochrone = await getIsochrone(stopId, duration);
    if (!isochrone) {
      throw new ApiError(
        503,
        "ANALYSIS_DATA_UNAVAILABLE",
        "The requested active isochrone is unavailable.",
      );
    }
    setResultCount(1);
    return isochrone;
  });
}
