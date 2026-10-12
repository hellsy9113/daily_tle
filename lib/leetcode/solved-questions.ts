import { ApiError } from "@/lib/http/api-error";
import { isNonNegativeInteger, isRecord } from "@/lib/http/validation";
import type { CalendarPeriodRange } from "./calendar-periods";
import { queryLeetCode } from "./client";
import { RECENT_ACCEPTED_SUBMISSIONS_QUERY } from "./queries";
import type { AcceptedSubmission, SolvedPeriod, SolvedQuestionsResult } from "./types";
import { parseUsername } from "./validation";

const ACCEPTED_HISTORY_LIMIT = 20;

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

/** Shared retrieval and filtering; callers capture calendar boundaries before fetching. */
export async function getSolvedQuestions(
  username: string,
  period: SolvedPeriod,
  range: CalendarPeriodRange,
): Promise<SolvedQuestionsResult> {
  const parsedUsername = parseUsername(username);
  const data = await queryLeetCode(RECENT_ACCEPTED_SUBMISSIONS_QUERY, {
    username: parsedUsername,
    limit: ACCEPTED_HISTORY_LIMIT,
  });

  if (isRecord(data) && data.matchedUser === null) {
    throw new ApiError(404, "LeetCode user was not found.");
  }

  if (
    !isRecord(data) ||
    !isRecord(data.matchedUser) ||
    typeof data.matchedUser.username !== "string" ||
    !data.matchedUser.username.trim() ||
    !Array.isArray(data.recentAcSubmissionList) ||
    !data.recentAcSubmissionList.every(isAcceptedSubmission)
  ) {
    throw new ApiError(502, "LeetCode returned an invalid accepted submission history.");
  }

  const history = data.recentAcSubmissionList;
  const start = range.start.getTime();
  const end = range.end.getTime();
  const inPeriod = history
    .filter(({ timestamp }) => {
      const submittedAt = Number(timestamp) * 1000;
      return submittedAt >= start && submittedAt < end;
    })
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const seenProblems = new Set<string>();
  const questions: AcceptedSubmission[] = [];

  for (const submission of inPeriod) {
    if (seenProblems.has(submission.titleSlug)) continue;
    seenProblems.add(submission.titleSlug);
    questions.push({
      title: submission.title,
      titleSlug: submission.titleSlug,
      timestamp: submission.timestamp,
    });
  }

  return {
    username: parsedUsername,
    period,
    timezone: "Asia/Kolkata",
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    count: questions.length,
    questions,
    // Only an older entry establishes that the available feed reaches before the period.
    mayBeIncomplete: !history.some(({ timestamp }) => Number(timestamp) * 1000 < start),
  };
}
