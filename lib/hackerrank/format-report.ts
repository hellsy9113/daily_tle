import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  getPreviousCalendarPeriod,
  type CalendarPeriodRange,
} from "@/lib/leetcode/calendar-periods";
import { splitMessage } from "@/lib/telegram/format-submissions";
import type { HackerRankProfile, StoredHackerRankProblem } from "./types";

export function formatHackerRankDailyReport(
  profile: HackerRankProfile,
  saved: StoredHackerRankProblem[],
  periodEnd: Date,
  weeklyRange?: CalendarPeriodRange,
  timezone = DEFAULT_TIMEZONE,
) {
  const range = weeklyRange ?? getPreviousCalendarPeriod("lastday", periodEnd, timezone);
  const known = new Map(saved.map((problem) => [problem.id, problem]));
  for (const problem of profile.problems) {
    const previous = known.get(problem.id);
    if (!previous || problem.solvedAt < previous.solvedAt)
      known.set(problem.id, { ...problem, baseline: false, firstObservedAt: profile.checkedAt });
  }
  const problems = [...known.values()].filter(
    (problem) =>
      Date.parse(problem.solvedAt) >= range.start.getTime() &&
      Date.parse(problem.solvedAt) < range.end.getTime(),
  );
  if (!weeklyRange && !problems.length) return [];
  const date = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(range.start);
  return splitMessage(
    [
      weeklyRange
        ? `HackerRank weekly recap for ${profile.username}\n${date} – ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(range.end)} (${timezone}; Sunday cutoff)`
        : `HackerRank daily recap for ${profile.username}\n${date} (${timezone})`,
      `${problems.length} unique solved challenges found in saved public activity for ${weeklyRange ? "this week through the cutoff" : "yesterday"}.`,
      ...problems.map((problem, index) => `${index + 1}. ${problem.title}\n${problem.url}`),
      "Public activity may be incomplete. Timestamps are reported by HackerRank; first-ever solve dates are not guaranteed.",
      ...(!profile.historyComplete
        ? ["Only a bounded portion of the public history could be fetched in this check."]
        : []),
    ].join("\n\n"),
  );
}
