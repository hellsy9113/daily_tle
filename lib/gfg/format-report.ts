import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  getPreviousCalendarPeriod,
  type CalendarPeriodRange,
} from "@/lib/leetcode/calendar-periods";
import { splitMessage } from "@/lib/telegram/format-submissions";
import type { GfgProblem, GfgProfile, StoredGfgProblem } from "./types";

const problemLine = (problem: GfgProblem, index: number) =>
  `${index + 1}. ${problem.title} · ${problem.difficulty}\n${problem.url}`;

export function formatGfgDailyReport(
  profile: GfgProfile,
  saved: StoredGfgProblem[],
  periodEnd: Date,
  weeklyRange?: CalendarPeriodRange,
  timezone = DEFAULT_TIMEZONE,
) {
  const range = weeklyRange ?? getPreviousCalendarPeriod("lastday", periodEnd, timezone);
  const known = new Map<string, GfgProblem>(saved.map((problem) => [problem.id, problem]));
  for (const problem of profile.problems) {
    const previous = known.get(problem.id)?.acceptedAt;
    known.set(
      problem.id,
      previous && (!problem.acceptedAt || previous < problem.acceptedAt)
        ? { ...problem, acceptedAt: previous }
        : problem,
    );
  }
  const dated = [...known.values()].filter(
    (problem) =>
      problem.acceptedAt &&
      Date.parse(problem.acceptedAt) >= range.start.getTime() &&
      Date.parse(problem.acceptedAt) < range.end.getTime(),
  );
  const observedYesterday = saved.filter(
    (problem) =>
      !problem.baseline &&
      !known.get(problem.id)?.acceptedAt &&
      Date.parse(problem.firstObservedAt) >= range.start.getTime() &&
      Date.parse(problem.firstObservedAt) < range.end.getTime(),
  );
  if (!weeklyRange && !dated.length && !observedYesterday.length) return [];
  const date = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(range.start);
  const weekEnd = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(range.end);
  const period = weeklyRange ? "this week's period" : "yesterday's period";
  const sections = [
    weeklyRange
      ? `GFG weekly recap for ${profile.username}\n${date} – ${weekEnd} (${timezone}; Sunday cutoff)`
      : `GFG daily recap for ${profile.username}\n${date} (${timezone})`,
    `Total solved on the public profile: ${profile.totalSolved}.`,
    dated.length
      ? `${dated.length} unique problems have an available accepted timestamp in ${period}. First-ever acceptance and complete history are not guaranteed.`
      : `${weeklyRange ? "This week's" : "Yesterday's"} exact solved count is unavailable: GFG's reported timestamps do not include a timezone.`,
  ];
  sections.push(...dated.map(problemLine));
  if (observedYesterday.length) {
    sections.push(
      weeklyRange
        ? "Newly observed during this week's checks (solve dates unverified):"
        : "Newly observed during yesterday's checks (solve dates unverified):",
    );
    sections.push(...observedYesterday.map(problemLine));
  }
  if (!profile.historyComplete)
    sections.push("Coverage warning: the available solved inventory is incomplete.");
  if (weeklyRange && !dated.length && !observedYesterday.length)
    sections.push(
      "No matching problems were found in saved activity for this period; this does not prove zero solves.",
    );
  return splitMessage(sections.join("\n\n"));
}
