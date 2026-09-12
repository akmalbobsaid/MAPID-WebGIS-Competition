import { withApiRoute } from "@/lib/server/api-contract";
import { listStops } from "@/lib/server/rujak-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiRoute(request, "GET /api/stops", {}, async ({ setResultCount }) => {
    const stops = await listStops();
    setResultCount(stops.length);
    return { stops };
  });
}
