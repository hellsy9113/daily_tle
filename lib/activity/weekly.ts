import { ACTIVITY_DAY_MS, activityDate, activityDayStart, weekStart } from "./calendar";
import type { ActivityDay, ActivityWeek, WeeklyComparison } from "./types";

/** Count a problem once per week, even if it was accepted on several days. */
export function compareWeeks(
  problems: { id: string; date: string }[],
  days: ActivityDay[],
  now: Date,
): WeeklyComparison {
  const today = activityDate(now);
  const start = weekStart(today);
  const end = activityDate(new Date(activityDayStart(today).getTime() + ACTIVITY_DAY_MS));
  const previous = activityDate(new Date(activityDayStart(start).getTime() - 7 * ACTIVITY_DAY_MS));
  const previousEnd = activityDate(new Date(activityDayStart(end).getTime() - 7 * ACTIVITY_DAY_MS));
  const coverage = new Map(days.map((day) => [day.date, day.coverage]));
  function period(from: string, until: string): ActivityWeek {
    const dates = Array.from(
      {
        length: Math.round(
          (activityDayStart(until).getTime() - activityDayStart(from).getTime()) / ACTIVITY_DAY_MS,
        ),
      },
      (_, index) =>
        activityDate(new Date(activityDayStart(from).getTime() + index * ACTIVITY_DAY_MS)),
    );
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
