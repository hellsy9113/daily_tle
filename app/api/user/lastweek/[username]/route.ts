import { errorResponse } from "@/lib/http/api-error";
import { getLastWeekSolvedQuestions } from "@/lib/leetcode/last-week-solved";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/user/lastweek/[username]">,
): Promise<Response> {
  try {
    const { username } = await context.params;
    return Response.json(await getLastWeekSolvedQuestions(username));
  } catch (error) {
    return errorResponse(error);
  }
}
