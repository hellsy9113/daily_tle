import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { splitMessage } from "@/lib/telegram/format-submissions";
import type { GfgProblem, GfgProfile, StoredGfgProblem } from "./types";

const problemLine = (problem: GfgProblem, index: number) =>
  `${index + 1}. ${problem.title} · ${problem.difficulty}\n${problem.url}`;

export function formatGfgDailyReport(
  profile: GfgProfile,
  saved: StoredGfgProblem[],
  periodEnd: Date,
  hasBaseline = true,
) {
  const range = getPreviousCalendarPeriod("lastday", periodEnd);
  const known = new Set(saved.map((problem) => problem.id));
  const savedDates = new Map(saved.map((problem) => [problem.id, problem.acceptedAt]));
  const available = profile.problems.map((problem) => {
    const previous = savedDates.get(problem.id);
    return previous && (!problem.acceptedAt || previous < problem.acceptedAt)
      ? { ...problem, acceptedAt: previous }
      : problem;
  });
  const dated = available.filter(
    (problem) =>
      problem.acceptedAt &&
      Date.parse(problem.acceptedAt) >= range.start.getTime() &&
      Date.parse(problem.acceptedAt) < range.end.getTime(),
  );
  const newlyObserved = hasBaseline ? available.filter((problem) => !known.has(problem.id)) : [];
  const haveDates = available.some((problem) => problem.acceptedAt);
  const datedIds = new Set(dated.map((problem) => problem.id));
  const observedYesterday = saved.filter(
    (problem) =>
      !problem.baseline &&
      !datedIds.has(problem.id) &&
      Date.parse(problem.firstObservedAt) >= range.start.getTime() &&
      Date.parse(problem.firstObservedAt) < range.end.getTime(),
  );
  const date = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(range.start);
  const sections = [
    `GFG daily recap for ${profile.username}\n${date} (Asia/Kolkata)`,
    `Total solved on the public profile: ${profile.totalSolved}.`,
    haveDates
      ? `${dated.length} unique problems have an available accepted timestamp in yesterday's period. First-ever acceptance and complete history are not guaranteed.`
      : "Yesterday's exact solved count is unavailable: GFG's reported timestamps do not include a timezone. This is not a zero-solve report.",
  ];
  const undated = newlyObserved.filter((problem) => !problem.acceptedAt);
  const problems = haveDates ? dated : newlyObserved;
  if (observedYesterday.length) {
    sections.push("Newly observed during yesterday's checks (solve dates unverified):");
    sections.push(...observedYesterday.map(problemLine));
  }
  if (!haveDates && problems.length)
    sections.push("Newly observed since the previous check (solve dates unverified):");
  if (!hasBaseline)
    sections.push(
      "This first inventory establishes a baseline. Historical problems are not reported as newly observed.",
    );
  else if (!haveDates && !problems.length)
    sections.push(
      "No additional solved problems were observed since the saved inventory. Keep practicing!",
    );
  sections.push(...problems.map(problemLine));
  if (haveDates && undated.length) {
    sections.push("Also newly observed since the previous check (solve dates unverified):");
    sections.push(...undated.map(problemLine));
  }
  if (!profile.historyComplete)
    sections.push("Coverage warning: the available solved inventory is incomplete.");
  return splitMessage(sections.join("\n\n"));
}
