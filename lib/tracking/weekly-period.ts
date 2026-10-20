import {
  DEFAULT_TIMEZONE,
  localClock,
  localTime,
  localDayStart,
  addCalendarDays,
} from "@/lib/timezone";
import { weekStart } from "@/lib/activity/calendar";
export function isSundayInIst(now: Date, timezone = DEFAULT_TIMEZONE) {
  return new Date(`${localClock(now, timezone).date}T12:00:00Z`).getUTCDay() === 0;
}
export function weeklyReportPeriod(now: Date, timezone = DEFAULT_TIMEZONE) {
  const start = weekStart(localClock(now, timezone).date);
  const cutoff = localTime(addCalendarDays(start, 6), 23 * 60, timezone);
  return { start: localDayStart(start, timezone), end: cutoff, reportDate: start, cutoff };
}
