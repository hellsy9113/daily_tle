import { getCurrentCalendarPeriod } from "./calendar-periods";
import { getSolvedQuestions } from "./solved-questions";

export function getCurrentSolvedQuestions(
  username: string,
  period: "today" | "thisweek",
  now = new Date(),
) {
  return getSolvedQuestions(username, period, getCurrentCalendarPeriod(period, now));
}
