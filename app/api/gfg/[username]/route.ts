import { requireAccount } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getGfgProgress } from "@/lib/gfg/service";
import { parseGfgQuery, parseGfgUsername } from "@/lib/gfg/validation";

export async function GET(request: Request, context: RouteContext<"/api/gfg/[username]">) {
  try {
    const username = parseGfgUsername((await context.params).username);
    const query = parseGfgQuery(new URL(request.url).searchParams);
    const account = await requireAccount(request);
    if (!account.gfgUsername || username.toLowerCase() !== account.gfgUsername.toLowerCase())
      throw new ApiError(403, "Enable GFG tracking for this username on the Feature page first.");
    return Response.json(await getGfgProgress(account, query), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
