import type { RecentSolvedQuestions } from "@/lib/leetcode/types";
import { splitMessage } from "./format-submissions";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function formatRecentSolved(result: RecentSolvedQuestions) {
  return splitMessage(
    [
      `Recent Accepted problems for ${result.username}`,
      result.questions.length
        ? `${result.count} unique problems found.`
        : "No recently Accepted problems were found in the available public history.",
      ...result.questions.map(
        (problem, index) =>
          `${index + 1}. ${problem.title}\n${dateFormatter.format(new Date(Number(problem.timestamp) * 1000))} IST\nhttps://leetcode.com/problems/${encodeURIComponent(problem.titleSlug)}/`,
      ),
      `Based on up to ${result.sourceLimit} public Accepted submissions; this is not a complete solved history.`,
    ].join("\n\n"),
  );
}
