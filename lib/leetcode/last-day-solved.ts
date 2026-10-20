import { getPreviousCalendarPeriod } from "./calendar-periods";
import { getSolvedQuestions } from "./solved-questions";
import type { SolvedQuestionsResult } from "./types";

export async function getLastDaySolvedQuestions(
  username: string,
  now: Date = new Date(),
): Promise<SolvedQuestionsResult> {
  const range = getPreviousCalendarPeriod("lastday", now);
  return getSolvedQuestions(username, "lastday", range);
}
