import { errorResponse } from "@/lib/http/api-error";
import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/user/weeklySolved/[username]">,
): Promise<Response> {
  try {
    const { username } = await context.params;
    return Response.json(await getRecentSubmissions(username));
  } catch (error) {
    return errorResponse(error);
  }
}
