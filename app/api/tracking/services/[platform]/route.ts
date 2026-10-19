import { handleFeature } from "@/lib/features/handlers";

function handler(method: "GET" | "POST" | "PATCH" | "DELETE") {
  return async (request: Request, context: RouteContext<"/api/tracking/services/[platform]">) =>
    handleFeature(request, (await context.params).platform, method);
}

export const GET = handler("GET");
export const POST = handler("POST");
export const PATCH = handler("PATCH");
export const DELETE = handler("DELETE");
