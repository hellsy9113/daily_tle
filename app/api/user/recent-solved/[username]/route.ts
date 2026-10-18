import { errorResponse } from "@/lib/http/api-error";
import { getRecentSolvedQuestions } from "@/lib/leetcode/recent-solved";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/user/recent-solved/[username]">,
) {
  try {
    return Response.json(await getRecentSolvedQuestions((await context.params).username), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
