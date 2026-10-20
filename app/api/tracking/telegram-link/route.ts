import { requireAccount } from "@/lib/auth/session";
import { readJson } from "@/lib/http/private";
import { isRecord } from "@/lib/http/validation";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { createConnectionLink } from "@/lib/tracking/registration";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body = await readJson(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "registrationId") ||
      typeof body.registrationId !== "string"
    )
      throw new ApiError(400, "Provide the current Daily Grind registration.");
    return Response.json(await createConnectionLink(account, body.registrationId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
