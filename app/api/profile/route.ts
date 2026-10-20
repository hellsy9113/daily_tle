import { eq } from "drizzle-orm";
import { requireAccount } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { profileSummary } from "@/lib/profile";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function GET(request: Request) {
  try {
    return Response.json(await profileSummary(await requireAccount(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body: unknown = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON");
    });
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "theme") ||
      (body.theme !== "light" && body.theme !== "dark")
    )
      throw new ApiError(400, "Choose light or dark mode.");
    await db().update(accounts).set({ theme: body.theme }).where(eq(accounts.id, account.id));
    return Response.json({ theme: body.theme }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
