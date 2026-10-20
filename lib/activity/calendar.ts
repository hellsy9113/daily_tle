import { localClock, localDayStart, addCalendarDays } from "@/lib/timezone";
import type { ActivityDay } from "./types";

export const ACTIVITY_TIMEZONE = "Asia/Kolkata" as const;
export const ACTIVITY_DAY_MS = 86_400_000;
export function activityDate(value: Date, timezone: string = ACTIVITY_TIMEZONE): string {
  return localClock(value, timezone).date;
}
export function activityDayStart(date: string, timezone: string = ACTIVITY_TIMEZONE): Date {
  return localDayStart(date, timezone);
}
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}
export function activityWindow(now: Date, timezone: string = ACTIVITY_TIMEZONE) {
  const today = activityDate(now, timezone);
  const end = addCalendarDays(today, 1);
  const start = addCalendarDays(end, -365);
  const dates = Array.from({ length: 365 }, (_, index) => addCalendarDays(start, index));
  return { start, end, today, dates };
}

export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  return count >= 8 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;
}

export function activityWeeks(days: ActivityDay[]): (ActivityDay | null)[][] {
  if (!days.length) return [];
  const weekday = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();
  const cells: (ActivityDay | null)[] = [...Array<null>(weekday).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

export function streaks(days: ActivityDay[]) {
  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  let index = days.length - 1;
  if (days[index]?.count === 0) index--; // An unfinished today does not break yesterday's streak.
  let currentStreak = 0;
  while (index >= 0 && days[index].count > 0) {
    currentStreak++;
    index--;
  }
  const endsAtUnknownDay = index >= 0 && days[index].coverage !== "complete";
  const todayUncertain = Boolean(days.at(-1)?.count === 0 && days.at(-1)?.coverage !== "complete");
  return {
    currentStreak:
      currentStreak === 0 && (endsAtUnknownDay || todayUncertain) ? null : currentStreak,
    currentStreakMayBeLonger: endsAtUnknownDay || todayUncertain || index < 0,
    longestStreak,
    longestStreakMayBeLonger:
      Boolean(days[0]?.count) ||
      days.slice(0, -1).some((day) => !day.count && day.coverage !== "complete"),
  };
}
