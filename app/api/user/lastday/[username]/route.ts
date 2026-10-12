import { errorResponse } from "@/lib/http/api-error";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/user/lastday/[username]">,
): Promise<Response> {
  try {
    const { username } = await context.params;
    return Response.json(await getLastDaySolvedQuestions(username));
  } catch (error) {
    return errorResponse(error);
  }
}
