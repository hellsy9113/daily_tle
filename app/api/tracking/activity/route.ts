import { requireAccount } from "@/lib/auth/session";
import { getAccountActivity } from "@/lib/activity/service";
import { errorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return Response.json(await getAccountActivity(await requireAccount(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
