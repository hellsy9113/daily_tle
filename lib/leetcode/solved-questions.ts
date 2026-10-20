import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { getAcceptedHistory } from "./accepted-history";
import type { CalendarPeriodRange } from "./calendar-periods";
import type { AcceptedSubmission, SolvedPeriod, SolvedQuestionsResult } from "./types";

/** Shared retrieval and filtering; callers capture calendar boundaries before fetching. */
export async function getSolvedQuestions(
  username: string,
  period: SolvedPeriod,
  range: CalendarPeriodRange,
  timezone = DEFAULT_TIMEZONE,
): Promise<SolvedQuestionsResult> {
  const { username: parsedUsername, submissions: history } = await getAcceptedHistory(username);
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
    timezone,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    count: questions.length,
    questions,
    // Only an older entry establishes that the available feed reaches before the period.
    mayBeIncomplete: !history.some(({ timestamp }) => Number(timestamp) * 1000 < start),
  };
}
