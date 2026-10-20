import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { activityDate, activityWindow, weekStart } from "@/lib/activity/calendar";
import { compareWeeks } from "@/lib/activity/weekly";
import type { GfgProfileSummary, GfgProgress, GfgQuery, StoredGfgProblem } from "./types";

export const monday = weekStart;

export function buildGfgProgress(
  profile: GfgProfileSummary,
  problems: StoredGfgProblem[],
  snapshots: GfgProgress["snapshots"],
  now: Date,
  query: GfgQuery = { period: "all", includeProblems: false },
  timezone = DEFAULT_TIMEZONE,
): GfgProgress {
  const range = activityWindow(now, timezone);
  const dated = problems.filter(
    (problem) => problem.acceptedAt && problem.acceptedAt <= now.toISOString(),
  );
  const observed = problems.filter(
    (problem) => !problem.baseline && problem.firstObservedAt <= now.toISOString(),
  );
  const daily = new Map<string, number>();
  const weekly = new Map<string, number>();
  const observations = new Map<string, number>();
  for (const problem of dated) {
    const date = activityDate(new Date(problem.acceptedAt!), timezone);
    daily.set(date, (daily.get(date) ?? 0) + 1);
    const week = monday(date);
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
  }
  for (const problem of observed) {
    const date = activityDate(new Date(problem.firstObservedAt), timezone);
    observations.set(date, (observations.get(date) ?? 0) + 1);
  }
  const within = (date: string) =>
    date >= (query.startDate ?? range.start) && date < (query.endDate ?? range.end);
  const selectedDays = [...daily].filter(([date]) => within(date)).sort();
  const selectedWeeks = new Map<string, number>();
  const observedDates = new Set(
    timezone === DEFAULT_TIMEZONE ? snapshots.map((snapshot) => snapshot.date) : [],
  );
  for (const [date, count] of selectedDays) {
    const week = monday(date);
    selectedWeeks.set(week, (selectedWeeks.get(week) ?? 0) + count);
  }
  const days = range.dates.filter(within).map((date) => ({
    date,
    count: (dated.length ? daily : observations).get(date) ?? 0,
    coverage: ((dated.length ? daily.has(date) : observations.has(date) || observedDates.has(date))
      ? "partial"
      : "unknown") as "partial" | "unknown",
  }));
  return {
    ...profile,
    timezone,
    dateBasis: dated.length ? "earliest_available_timestamp" : "observation",
    solvedToday: dated.length ? (daily.get(range.today) ?? 0) : null,
    solvedThisWeek: dated.length ? (weekly.get(monday(range.today)) ?? 0) : null,
    dailySolved:
      dated.length && query.period !== "weekly"
        ? selectedDays.map(([date, count]) => ({ date, count }))
        : null,
    weeklySolved:
      dated.length && query.period !== "daily"
        ? [...selectedWeeks].sort().map(([weekStart, count]) => ({ weekStart, count }))
        : null,
    observedToday: observations.get(range.today) ?? 0,
    observedThisWeek: [...observations]
      .filter(([date]) => monday(date) === monday(range.today))
      .reduce((total, [, count]) => total + count, 0),
    days,
    weekly: compareWeeks(
      (dated.length ? dated : observed).map((problem) => ({
        id: problem.id,
        date: activityDate(
          new Date(dated.length ? problem.acceptedAt! : problem.firstObservedAt),
          timezone,
        ),
      })),
      days,
      now,
      timezone,
    ),
    snapshots: snapshots.filter((snapshot) => within(snapshot.date)),
    refreshing: false,
    refreshFailed: false,
    limitations: [
      "GFG exposes a solved inventory, not a complete attempt log. First-ever accepted dates are not guaranteed.",
      "Timestamps without a timezone offset are retained as reported text. Exact daily and weekly solve counts are unavailable for those problems.",
      "Observation activity starts after registration. Initial imports are a baseline; newly observed problems are not assigned a guessed solve date.",
      ...(!profile.historyComplete
        ? [
            "The public solved inventory does not cover the full profile total. Difficulty counts reflect available problems.",
          ]
        : []),
    ],
    ...(query.includeProblems
      ? {
          solvedProblems: problems.map((problem) => ({
            id: problem.id,
            title: problem.title,
            url: problem.url,
            difficulty: problem.difficulty,
            status: problem.status,
            acceptedAt: problem.acceptedAt,
            reportedSubmissionTime: problem.reportedSubmissionTime,
          })),
        }
      : {}),
  };
}
