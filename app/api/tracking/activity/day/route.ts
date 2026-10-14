import { requireAccount } from "@/lib/auth/session";
import { getActivityDay } from "@/lib/activity/details";
import { parseActivityDate, parseActivityPlatform } from "@/lib/activity/validation";
import { errorResponse } from "@/lib/http/api-error";

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const params = new URL(request.url).searchParams;
    const platform = parseActivityPlatform(params.get("platform"));
    const date = parseActivityDate(params.get("date"));
    return Response.json(await getActivityDay(account, platform, date), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
