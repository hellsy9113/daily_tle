import type { SolvedQuestionsResult } from "@/lib/leetcode/types";
import { formatSolvedQuestions } from "@/lib/telegram/format-solved-questions";

export const EMPTY_REPORT = "hmm..no question found.do it today, I will be waiting";
export function formatDailyReport(result: SolvedQuestionsResult): string[] {
  return result.questions.length ? formatSolvedQuestions(result) : [];
}
