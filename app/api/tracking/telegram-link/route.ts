import { requireAccount } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { createConnectionLink } from "@/lib/tracking/registration";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json(await createConnectionLink(await requireAccount(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
