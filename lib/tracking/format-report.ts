import type { SolvedQuestionsResult } from "@/lib/leetcode/types";
import { formatSolvedQuestions } from "@/lib/telegram/format-solved-questions";

export const EMPTY_REPORT = "hmm..no question found.do it today, I will be waiting";
export function formatDailyReport(result: SolvedQuestionsResult): string[] {
  if (result.count) return formatSolvedQuestions(result);
  const warning =
    "Coverage warning: LeetCode exposes only recent public Accepted submissions. More problems may have been solved in this period.";
  return [result.mayBeIncomplete ? `${EMPTY_REPORT}\n\n${warning}` : EMPTY_REPORT];
}
