import type { AcceptedSubmission, SolvedQuestionsResult } from "@/lib/leetcode/types";
import { activityDate, activityDayStart, activityWindow, ACTIVITY_DAY_MS } from "./calendar";
import type { ActivityObservation, AcceptedProblemObservation } from "./types";

function uniqueObservations(history: AcceptedSubmission[], start: Date, end: Date) {
  const problems = new Map<string, AcceptedProblemObservation>();
  for (const item of history) {
    const acceptedAt = new Date(Number(item.timestamp) * 1000);
    if (acceptedAt < start || acceptedAt >= end) continue;
    const date = activityDate(acceptedAt);
    const key = `${date}:${item.titleSlug}`;
    const previous = problems.get(key);
    if (!previous || previous.acceptedAt < acceptedAt)
      problems.set(key, { date, title: item.title, titleSlug: item.titleSlug, acceptedAt });
  }
  return [...problems.values()];
}

/** A returned entry proves coverage only after that entry's timestamp, never before it. */
export function observeAcceptedHistory(
  history: AcceptedSubmission[],
  now: Date,
): ActivityObservation {
  const range = activityWindow(now);
  const available = history.filter((item) => Number(item.timestamp) * 1000 < now.getTime());
  const oldest = available.length
    ? new Date(Math.min(...available.map((item) => Number(item.timestamp) * 1000)))
    : null;
  const dates = oldest
    ? range.dates.filter(
        (date) => activityDayStart(date).getTime() + ACTIVITY_DAY_MS > oldest.getTime(),
      )
    : [range.today];
  return {
    checkedAt: now,
    problems: uniqueObservations(available, activityDayStart(range.start), now),
    days: dates.map((date) => ({
      date,
      from: oldest,
      until: new Date(Math.min(now.getTime(), activityDayStart(date).getTime() + ACTIVITY_DAY_MS)),
    })),
  };
}

/** Reuse the exact report period; failed lookups never become zero-count observations. */
export function observeSolvedPeriod(
  result: SolvedQuestionsResult,
  checkedAt: Date,
): ActivityObservation {
  // Weekly results deduplicate across the whole week and cannot establish per-day counts.
  if (result.period !== "lastday") throw new Error("Activity collection requires a daily report.");
  const start = new Date(result.start);
  const end = new Date(result.end);
  const problems = uniqueObservations(result.questions, start, end);
  const from = !result.mayBeIncomplete
    ? new Date(start.getTime() - 1)
    : problems.length
      ? new Date(Math.min(...problems.map((problem) => problem.acceptedAt.getTime())))
      : null;
  const dates = Array.from(
    { length: (end.getTime() - start.getTime()) / ACTIVITY_DAY_MS },
    (_, index) => activityDate(new Date(start.getTime() + index * ACTIVITY_DAY_MS)),
  );
  return {
    problems,
    checkedAt,
    days: dates.map((date) => ({
      date,
      from,
      until: new Date(activityDayStart(date).getTime() + ACTIVITY_DAY_MS),
    })),
  };
}
