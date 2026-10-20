import type { SolvedPeriod } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
// India Standard Time is UTC+05:30 and has no daylight-saving transitions.
const IST_OFFSET_MS = 330 * 60 * 1000;

export interface CalendarPeriodRange {
  start: Date;
  end: Date;
}

/** Work entirely in UTC so the host's timezone cannot change the calendar boundaries. */
export function getPreviousCalendarPeriod(
  period: Extract<SolvedPeriod, "lastday" | "lastweek">,
  now: Date,
): CalendarPeriodRange {
  const localNow = new Date(now.getTime() + IST_OFFSET_MS);
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const todayStart = localMidnight - IST_OFFSET_MS;

  if (period === "lastday") {
    return { start: new Date(todayStart - DAY_MS), end: new Date(todayStart) };
  }

  const daysSinceMonday = (localNow.getUTCDay() + 6) % 7;
  const weekStart = todayStart - daysSinceMonday * DAY_MS;

  return { start: new Date(weekStart - 7 * DAY_MS), end: new Date(weekStart) };
}

export function getCurrentCalendarPeriod(
  period: Extract<SolvedPeriod, "today" | "thisweek">,
  now: Date,
): CalendarPeriodRange {
  const previous = getPreviousCalendarPeriod(period === "today" ? "lastday" : "lastweek", now);
  return { start: previous.end, end: new Date(now.getTime() + 1) };
}
