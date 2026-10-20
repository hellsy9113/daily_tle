import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";

const IST_OFFSET = 330 * 60_000;

export function isSundayInIst(now: Date) {
  return new Date(now.getTime() + IST_OFFSET).getUTCDay() === 0;
}

/** Freeze Monday through Sunday's 23:00 IST cutoff, including on recovery. */
export function weeklyReportPeriod(now: Date) {
  const previous = getPreviousCalendarPeriod("lastweek", now);
  const cutoff = new Date(previous.end.getTime() + (6 * 24 + 23) * 60 * 60_000);
  return {
    start: previous.end,
    end: cutoff,
    reportDate: new Date(previous.end.getTime() + IST_OFFSET).toISOString().slice(0, 10),
    cutoff,
  };
}
