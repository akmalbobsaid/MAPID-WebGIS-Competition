import { withApiRoute } from "@/lib/server/api-contract";
import { parseAgusRequest } from "@/lib/server/agus/contracts";
import { answerAgus } from "@/lib/server/agus/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApiRoute(request, "POST /api/agus", {}, async ({ setResultCount, setLogMetadata }) => {
    const criteria = await parseAgusRequest(request);
    const result = await answerAgus(criteria);
    setResultCount(result.response.result?.result_count ?? 0);
    setLogMetadata(result.observability);
    return result.response;
  });
}
