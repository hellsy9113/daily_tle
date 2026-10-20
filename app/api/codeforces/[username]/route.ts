import { requireAccount } from "@/lib/auth/session";
import { getCodeforcesProgress } from "@/lib/codeforces/service";
import { parseCodeforcesUsername } from "@/lib/codeforces/client";
import { ApiError, errorResponse } from "@/lib/http/api-error";

export async function GET(request: Request, context: RouteContext<"/api/codeforces/[username]">) {
  try {
    const account = await requireAccount(request);
    const username = parseCodeforcesUsername((await context.params).username);
    if (
      !account.codeforcesUsername ||
      username.toLowerCase() !== account.codeforcesUsername.toLowerCase()
    )
      throw new ApiError(
        403,
        "Enable Codeforces tracking for this username on the Feature page first.",
      );
    return Response.json(await getCodeforcesProgress(account), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
