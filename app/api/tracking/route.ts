import { requireAccount } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { parseRegistration } from "@/lib/tracking/agreement";
import { registerUsername, trackingStatus } from "@/lib/tracking/registration";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function GET(request: Request) {
  try {
    return Response.json(await trackingStatus(await requireAccount(request)), {
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
    return Response.json(await registerUsername(account, parseRegistration(body)), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
