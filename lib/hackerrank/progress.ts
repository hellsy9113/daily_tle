import { activityDate, activityWindow, weekStart } from "@/lib/activity/calendar";
import type { HackerRankProgress, HackerRankSummary, StoredHackerRankProblem } from "./types";

export function buildHackerRankProgress(
  profile: HackerRankSummary,
  problems: StoredHackerRankProblem[],
  snapshots: { date: string }[],
  now: Date,
): HackerRankProgress {
  const range = activityWindow(now);
  const dated = problems.filter((problem) => problem.solvedAt <= now.toISOString());
  const counts = new Map<string, number>();
  for (const problem of dated) {
    const date = activityDate(new Date(problem.solvedAt));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const observed = new Set(snapshots.map((snapshot) => snapshot.date));
  return {
    ...profile,
    timezone: "Asia/Kolkata",
    savedSolved: problems.length,
    solvedToday: counts.get(range.today) ?? 0,
    solvedThisWeek: dated.filter(
      (problem) => weekStart(activityDate(new Date(problem.solvedAt))) === weekStart(range.today),
    ).length,
    days: range.dates.map((date) => ({
      date,
      count: counts.get(date) ?? 0,
      coverage: counts.has(date) || observed.has(date) ? "partial" : "unknown",
    })),
    refreshing: false,
    refreshFailed: false,
  };
}
