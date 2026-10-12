import { getPreviousCalendarPeriod } from "./calendar-periods";
import { getSolvedQuestions } from "./solved-questions";
import type { SolvedQuestionsResult } from "./types";

export async function getLastWeekSolvedQuestions(
  username: string,
  now: Date = new Date(),
): Promise<SolvedQuestionsResult> {
  const range = getPreviousCalendarPeriod("lastweek", now);
  return getSolvedQuestions(username, "lastweek", range);
}
