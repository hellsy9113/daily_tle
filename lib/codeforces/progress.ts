import { activityDate, activityDayStart, activityWindow, weekStart } from "@/lib/activity/calendar";
import type {
  CodeforcesProgress,
  CodeforcesSnapshot,
  CodeforcesSummary,
  StoredCodeforcesProblem,
} from "./types";

export function buildCodeforcesProgress(
  profile: CodeforcesSummary,
  problems: StoredCodeforcesProblem[],
  snapshots: CodeforcesSnapshot[],
  now: Date,
): CodeforcesProgress {
  const range = activityWindow(now);
  const dated = problems.filter((problem) => problem.solvedAt <= now.toISOString());
  const daily = new Map<string, Set<string>>();
  for (const problem of dated) {
    const date = activityDate(new Date(problem.solvedAt));
    const ids = daily.get(date) ?? new Set<string>();
    ids.add(problem.id);
    daily.set(date, ids);
  }
  const intervals = [
    ...snapshots.flatMap((snapshot) =>
      snapshot.historyStart
        ? [
            {
              start: snapshot.historyStart.getTime(),
              end: Math.min(snapshot.checkedAt.getTime(), now.getTime()),
            },
          ]
        : [],
    ),
    ...(profile.historyStart
      ? [
          {
            start: Date.parse(profile.historyStart),
            end: Math.min(Date.parse(profile.checkedAt), now.getTime()),
          },
        ]
      : []),
  ].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return {
    ...profile,
    timezone: "Asia/Kolkata",
    savedSolved: new Set(dated.map((problem) => problem.id)).size,
    solvedToday: daily.get(range.today)?.size ?? 0,
    solvedThisWeek: new Set(
      dated
        .filter(
          (problem) =>
            weekStart(activityDate(new Date(problem.solvedAt))) === weekStart(range.today),
        )
        .map((problem) => problem.id),
    ).size,
    days: range.dates.map((date) => {
      const start = activityDayStart(date).getTime();
      const end = start + 86400000;
      const complete = merged.some((interval) => interval.start <= start && interval.end >= end);
      const observed = merged.some((interval) => interval.start < end && interval.end >= start);
      return {
        date,
        count: daily.get(date)?.size ?? 0,
        coverage: complete ? "complete" : observed || daily.has(date) ? "partial" : "unknown",
      };
    }),
    refreshing: false,
    refreshFailed: false,
  };
}
