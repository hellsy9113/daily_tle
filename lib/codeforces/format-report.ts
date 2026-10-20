import {
  getPreviousCalendarPeriod,
  type CalendarPeriodRange,
} from "@/lib/leetcode/calendar-periods";
import { splitMessage } from "@/lib/telegram/format-submissions";
import type { CodeforcesProfile, StoredCodeforcesProblem } from "./types";

export function formatCodeforcesDailyReport(
  profile: CodeforcesProfile,
  saved: StoredCodeforcesProblem[],
  periodEnd: Date,
  weeklyRange?: CalendarPeriodRange,
) {
  const range = weeklyRange ?? getPreviousCalendarPeriod("lastday", periodEnd);
  const checked = profile.checkedSubmissionIds && new Set(profile.checkedSubmissionIds);
  const known = new Map(
    saved
      .filter((problem) => !checked?.has(problem.submissionId))
      .map((problem) => [problem.submissionId, problem]),
  );
  for (const problem of profile.problems)
    known.set(problem.submissionId, {
      ...problem,
      baseline: false,
      firstObservedAt: profile.checkedAt,
    });
  const unique = new Map(
    [...known.values()]
      .filter(
        (problem) =>
          Date.parse(problem.solvedAt) >= range.start.getTime() &&
          Date.parse(problem.solvedAt) < range.end.getTime(),
      )
      .map((problem) => [problem.id, problem]),
  );
  const problems = [...unique.values()].sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  if (!weeklyRange && !problems.length) return [];
  const date = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(range.start);
  return splitMessage(
    [
      weeklyRange
        ? `Codeforces weekly recap for ${profile.username}\n${date} – ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(range.end)} (Asia/Kolkata; Sunday cutoff)`
        : `Codeforces daily recap for ${profile.username}\n${date} (Asia/Kolkata)`,
      `${problems.length} unique Accepted problems found in saved public submissions for ${weeklyRange ? "this week through the cutoff" : "yesterday"}.`,
      ...problems.map(
        (problem, index) =>
          `${index + 1}. ${problem.title}${problem.rating === null ? "" : ` · ${problem.rating}`}\n${problem.url}`,
      ),
      "Counts use public Accepted submission timestamps. Repeated accepts count once per problem in this recap; they do not prove a first-ever solve.",
      ...(!profile.historyComplete
        ? [
            "Only a bounded portion of public submission history was fetched; earlier activity may be missing.",
          ]
        : []),
    ].join("\n\n"),
  );
}
