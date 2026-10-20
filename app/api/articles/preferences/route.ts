import { requireAccount } from "@/lib/auth/session";
import { privateJson, readJson } from "@/lib/http/private";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { requireSameOrigin } from "@/lib/tracking/security";
import { updateArticleTopics } from "@/lib/articles/service";

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body = await readJson(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => !["registrationId", "topics"].includes(key)) ||
      typeof body.registrationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.registrationId)
    )
      throw new ApiError(400, "Provide the current Daily Articles registration and topics.");
    return privateJson(await updateArticleTopics(account.id, body.registrationId, body.topics));
  } catch (error) {
    return errorResponse(error);
  }
}
