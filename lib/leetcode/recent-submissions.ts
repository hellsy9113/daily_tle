import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { queryLeetCode } from "./client";
import { RECENT_SUBMISSIONS_QUERY } from "./queries";
import type { RecentSubmissions } from "./types";
import { isSubmission, parseUsername } from "./validation";

/** The legacy weeklySolved endpoint returns recent submissions, without a date filter. */
export async function getRecentSubmissions(username: string): Promise<RecentSubmissions> {
  const data = await queryLeetCode(RECENT_SUBMISSIONS_QUERY, {
    username: parseUsername(username),
  });
  if (
    !isRecord(data) ||
    !Array.isArray(data.recentSubmissionList) ||
    !data.recentSubmissionList.every(isSubmission)
  ) {
    throw new ApiError(502, "LeetCode returned an invalid submission list.");
  }
  return { recentSubmissionList: data.recentSubmissionList };
}
