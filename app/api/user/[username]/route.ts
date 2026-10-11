import { errorResponse } from "@/lib/http/api-error";
import { getUserProfile } from "@/lib/leetcode/user-profile";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/user/[username]">,
): Promise<Response> {
  try {
    const { username } = await context.params;
    return Response.json(await getUserProfile(username));
  } catch (error) {
    return errorResponse(error);
  }
}
