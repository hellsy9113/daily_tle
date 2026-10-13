import type { ActivityDay } from "./types";

export const ACTIVITY_TIMEZONE = "Asia/Kolkata" as const;
export const ACTIVITY_DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function activityDate(value: Date): string {
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function activityDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

export function activityWindow(now: Date) {
  const today = activityDate(now);
  const end = new Date(activityDayStart(today).getTime() + ACTIVITY_DAY_MS);
  const start = new Date(end.getTime() - 365 * ACTIVITY_DAY_MS);
  const dates = Array.from({ length: 365 }, (_, index) =>
    activityDate(new Date(start.getTime() + index * ACTIVITY_DAY_MS)),
  );
  return { start: activityDate(start), end: activityDate(end), today, dates };
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
    longestStreakMayBeLonger: days
      .slice(0, -1)
      .some((day) => !day.count && day.coverage !== "complete"),
  };
}
