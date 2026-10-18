import { requireAccount } from "@/lib/auth/session";
import { registerHackerRank } from "@/lib/hackerrank/service";
import { trackingStatus } from "@/lib/tracking/registration";
import { requireSameOrigin } from "@/lib/tracking/security";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { parseRegistration } from "@/lib/tracking/agreement";

export async function GET(request: Request) {
  try {
    return Response.json(await trackingStatus(await requireAccount(request), "hackerrank"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
    return Response.json(await registerHackerRank(account, parseRegistration(body)), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
