import { ApiError, parseMerchantId, withApiRoute } from "@/lib/server/api-contract";
import { getMerchantDetail } from "@/lib/server/rujak-db";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/merchants/[merchantId]">) {
  const { merchantId: rawMerchantId } = await context.params;
  return withApiRoute(request, "GET /api/merchants/:merchantId", { merchantId: rawMerchantId }, async ({ setResultCount }) => {
    const merchantId = parseMerchantId(rawMerchantId);
    const merchant = await getMerchantDetail(merchantId);
    if (!merchant) {
      throw new ApiError(404, "MERCHANT_NOT_FOUND", "The requested merchant was not found.");
    }
    setResultCount(1);
    return { merchant };
  });
}
