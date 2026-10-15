import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { splitMessage } from "@/lib/telegram/format-submissions";
import type { GfgProblem, GfgProfile, StoredGfgProblem } from "./types";

const problemLine = (problem: GfgProblem, index: number) =>
  `${index + 1}. ${problem.title} · ${problem.difficulty}\n${problem.url}`;

export function formatGfgDailyReport(
  profile: GfgProfile,
  saved: StoredGfgProblem[],
  periodEnd: Date,
) {
  const range = getPreviousCalendarPeriod("lastday", periodEnd);
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
  if (!dated.length && !observedYesterday.length) return [];
  const date = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(range.start);
  const sections = [
    `GFG daily recap for ${profile.username}\n${date} (Asia/Kolkata)`,
    `Total solved on the public profile: ${profile.totalSolved}.`,
    dated.length
      ? `${dated.length} unique problems have an available accepted timestamp in yesterday's period. First-ever acceptance and complete history are not guaranteed.`
      : "Yesterday's exact solved count is unavailable: GFG's reported timestamps do not include a timezone.",
  ];
  sections.push(...dated.map(problemLine));
  if (observedYesterday.length) {
    sections.push("Newly observed during yesterday's checks (solve dates unverified):");
    sections.push(...observedYesterday.map(problemLine));
  }
  if (!profile.historyComplete)
    sections.push("Coverage warning: the available solved inventory is incomplete.");
  return splitMessage(sections.join("\n\n"));
}
