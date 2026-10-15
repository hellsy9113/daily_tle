import { requireAccount } from "@/lib/auth/session";
import { getHackerRankProgress } from "@/lib/hackerrank/service";
import { parseHackerRankUsername } from "@/lib/hackerrank/client";
import { ApiError, errorResponse } from "@/lib/http/api-error";

export async function GET(request: Request, context: RouteContext<"/api/hackerrank/[username]">) {
  try {
    const account = await requireAccount(request);
    const username = parseHackerRankUsername((await context.params).username);
    if (
      !account.hackerRankUsername ||
      username.toLowerCase() !== account.hackerRankUsername.toLowerCase()
    )
      throw new ApiError(
        403,
        "Enable HackerRank tracking for this username on the Feature page first.",
      );
    return Response.json(await getHackerRankProgress(account), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
