import "server-only";
import { requireAccount } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { privateJson, readJson } from "@/lib/http/private";
import { isRecord } from "@/lib/http/validation";
import { requireSameOrigin } from "@/lib/tracking/security";
import { isFeatureId, type FeatureId } from "./catalog";
import { featureAdapters } from "./server";
import { limitNotesAccess } from "@/lib/notes/access";

export async function handleFeature(request: Request, id: unknown, method = request.method) {
  try {
    if (method !== "GET") requireSameOrigin(request);
    const account = await requireAccount(request);
    if (!isFeatureId(id)) throw new ApiError(400, "Choose a supported service.");
    const adapter = featureAdapters[id];
    if (id === "notes" && method === "POST") await limitNotesAccess(request);
    if (method === "GET") return privateJson(await adapter.status(account));
    const body = await readJson(request);
    if (method === "POST")
      return privateJson(await adapter.register(account, adapter.parseRegistration(body)), 201);
    const deleting = method === "DELETE";
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
      ? await adapter.revoke(account.id, body.registrationId)
      : await adapter.pause(account.id, body.registrationId, body.paused as boolean);
    return privateJson(await adapter.status(updated));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Existing URLs remain thin aliases of the same handlers. */
export function registrationHandlers(id: FeatureId) {
  return {
    GET: (request: Request) => handleFeature(request, id, "GET"),
    POST: (request: Request) => handleFeature(request, id, "POST"),
  };
}
