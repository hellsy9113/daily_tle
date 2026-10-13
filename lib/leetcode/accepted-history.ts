import { ApiError } from "@/lib/http/api-error";
import { isNonNegativeInteger, isRecord } from "@/lib/http/validation";
import { queryLeetCode } from "./client";
import { RECENT_ACCEPTED_SUBMISSIONS_QUERY } from "./queries";
import type { AcceptedSubmission } from "./types";
import { parseUsername } from "./validation";

export const ACCEPTED_HISTORY_LIMIT = 20;

function isUnixTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  const seconds = Number(value);
  return isNonNegativeInteger(seconds) && Number.isFinite(new Date(seconds * 1000).getTime());
}

function isAcceptedSubmission(value: unknown): value is AcceptedSubmission {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.titleSlug === "string" &&
    value.titleSlug.trim().length > 0 &&
    isUnixTimestamp(value.timestamp)
  );
}

/** Public Accepted history is capped at 20, even when a larger limit is requested. */
export async function getAcceptedHistory(username: string) {
  const parsedUsername = parseUsername(username);
  const data = await queryLeetCode(RECENT_ACCEPTED_SUBMISSIONS_QUERY, {
    username: parsedUsername,
    limit: ACCEPTED_HISTORY_LIMIT,
  });
  if (isRecord(data) && data.matchedUser === null)
    throw new ApiError(404, "LeetCode user was not found.");
  if (
    !isRecord(data) ||
    !isRecord(data.matchedUser) ||
    typeof data.matchedUser.username !== "string" ||
    !data.matchedUser.username.trim() ||
    !Array.isArray(data.recentAcSubmissionList) ||
    !data.recentAcSubmissionList.every(isAcceptedSubmission)
  )
    throw new ApiError(502, "LeetCode returned an invalid accepted submission history.");
  return { username: parsedUsername, submissions: data.recentAcSubmissionList };
}
