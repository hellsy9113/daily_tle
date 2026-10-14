import { requireAccount } from "@/lib/auth/session";
import { getWeeklyGoal, saveWeeklyGoal } from "@/lib/activity/goals";
import { parseActivityPlatform, parseGoal } from "@/lib/activity/validation";
import { requireSameOrigin } from "@/lib/tracking/security";
import { ApiError, errorResponse } from "@/lib/http/api-error";

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const platform = parseActivityPlatform(new URL(request.url).searchParams.get("platform"));
    return Response.json(await getWeeklyGoal(account, platform), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
    const { platform, weeklyTarget } = parseGoal(body);
    return Response.json(await saveWeeklyGoal(account, platform, weeklyTarget), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
