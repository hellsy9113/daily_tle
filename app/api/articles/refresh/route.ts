import { requireAccount } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/tracking/security";
import { readJson, privateJson } from "@/lib/http/private";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { ArticleRefreshCooldown, refreshAccountArticles } from "@/lib/articles/refresh";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body = await readJson(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "registrationId") ||
      typeof body.registrationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.registrationId)
    )
      throw new ApiError(400, "Provide your current Daily Articles registration.");
    return privateJson(await refreshAccountArticles(account.id, body.registrationId));
  } catch (error) {
    const response = errorResponse(error);
    if (error instanceof ArticleRefreshCooldown)
      response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }
}
