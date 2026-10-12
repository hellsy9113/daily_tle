import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { queryLeetCode } from "./client";
import { parseUsername } from "./validation";

export async function getLeetCodeIdentity(value: string): Promise<string> {
  const username = parseUsername(value);
  const data = await queryLeetCode(
    `query getUserIdentity($username: String!) { matchedUser(username: $username) { username } }`,
    { username },
  );
  if (!isRecord(data)) throw new ApiError(502, "LeetCode returned an invalid response.");
  if (data.matchedUser === null) throw new ApiError(404, "LeetCode user was not found.");
  if (
    !isRecord(data.matchedUser) ||
    typeof data.matchedUser.username !== "string" ||
    !data.matchedUser.username.trim() ||
    data.matchedUser.username.length > 100 ||
    /\s/.test(data.matchedUser.username)
  )
    throw new ApiError(502, "LeetCode returned an invalid response.");
  return data.matchedUser.username;
}
