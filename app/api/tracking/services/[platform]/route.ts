import { requireAccount } from "@/lib/auth/session";
import { parseActivityPlatform } from "@/lib/activity/validation";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { requireSameOrigin } from "@/lib/tracking/security";
import { revokeService, setServicePaused } from "@/lib/tracking/services";
import { trackingStatus } from "@/lib/tracking/registration";

async function mutate(
  request: Request,
  context: RouteContext<"/api/tracking/services/[platform]">,
  deleting: boolean,
) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const platform = parseActivityPlatform((await context.params).platform);
    const body: unknown = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON");
    });
    const allowed = ["registrationId", deleting ? "confirmPermanentDeletion" : "paused"];
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      typeof body.registrationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.registrationId)
    )
      throw new ApiError(400, "Provide the current service registration.");
    if (deleting ? body.confirmPermanentDeletion !== true : typeof body.paused !== "boolean")
      throw new ApiError(
        400,
        deleting
          ? "Confirm permanent deletion before revoking this service."
          : "Provide a pause or resume choice.",
      );
    const updated = deleting
      ? await revokeService(account.id, platform, body.registrationId)
      : await setServicePaused(account.id, platform, body.registrationId, body.paused as boolean);
    return Response.json(await trackingStatus(updated, platform), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export const PATCH = (
  request: Request,
  context: RouteContext<"/api/tracking/services/[platform]">,
) => mutate(request, context, false);
export const DELETE = (
  request: Request,
  context: RouteContext<"/api/tracking/services/[platform]">,
) => mutate(request, context, true);
