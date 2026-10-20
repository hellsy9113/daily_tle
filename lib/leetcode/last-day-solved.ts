import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { getPreviousCalendarPeriod } from "./calendar-periods";
import { getSolvedQuestions } from "./solved-questions";
import type { SolvedQuestionsResult } from "./types";

export async function getLastDaySolvedQuestions(
  username: string,
  now: Date = new Date(),
  timezone = DEFAULT_TIMEZONE,
): Promise<SolvedQuestionsResult> {
  const range = getPreviousCalendarPeriod("lastday", now, timezone);
  return getSolvedQuestions(username, "lastday", range, timezone);
}
