import { addCalendarDays, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { activityDate, weekStart } from "./calendar";
import type { ActivityDay, ActivityWeek, WeeklyComparison } from "./types";

/** Count a problem once per week, even if it was accepted on several days. */
export function compareWeeks(
  problems: { id: string; date: string }[],
  days: ActivityDay[],
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): WeeklyComparison {
  const today = activityDate(now, timezone);
  const start = weekStart(today);
  const end = addCalendarDays(today, 1);
  const previous = addCalendarDays(start, -7);
  const previousEnd = addCalendarDays(end, -7);
  const coverage = new Map(days.map((day) => [day.date, day.coverage]));
  function period(from: string, until: string): ActivityWeek {
    const dates: string[] = [];
    for (let date = from; date < until; date = addCalendarDays(date, 1)) dates.push(date);
    return {
      start: from,
      end: until,
      count: new Set(
        problems
          .filter((problem) => problem.date >= from && problem.date < until)
          .map((problem) => problem.id),
      ).size,
      complete: dates.every((date) => coverage.get(date) === "complete"),
    };
  }
  return {
    current: period(start, end),
    previous: period(previous, start),
    previousToDate: period(previous, previousEnd),
  };
}
