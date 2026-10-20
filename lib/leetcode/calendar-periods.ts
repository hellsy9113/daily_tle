import type { SolvedPeriod } from "./types";
import { DEFAULT_TIMEZONE, localClock, localDayStart, addCalendarDays } from "@/lib/timezone";
import { weekStart } from "@/lib/activity/calendar";
export interface CalendarPeriodRange {
  start: Date;
  end: Date;
}
export function getPreviousCalendarPeriod(
  period: Extract<SolvedPeriod, "lastday" | "lastweek">,
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): CalendarPeriodRange {
  const today = localClock(now, timezone).date;
  const end = period === "lastday" ? today : weekStart(today);
  const start = addCalendarDays(end, period === "lastday" ? -1 : -7);
  return { start: localDayStart(start, timezone), end: localDayStart(end, timezone) };
}
export function getCurrentCalendarPeriod(
  period: Extract<SolvedPeriod, "today" | "thisweek">,
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): CalendarPeriodRange {
  const previous = getPreviousCalendarPeriod(
    period === "today" ? "lastday" : "lastweek",
    now,
    timezone,
  );
  return { start: previous.end, end: new Date(now.getTime() + 1) };
}
