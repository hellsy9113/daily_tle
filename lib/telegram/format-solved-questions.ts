import type { SolvedQuestionsResult } from "@/lib/leetcode/types";
import { splitMessage } from "./format-submissions";

export function formatSolvedQuestions(result: SolvedQuestionsResult): string[] {
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: result.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const startDate = dateFormatter.format(new Date(result.start));
  // The API's end is exclusive; display the last calendar date included in the period.
  const endDate = dateFormatter.format(new Date(Date.parse(result.end) - 1));
  const periodLabel = {
    lastweek: "Last week",
    lastday: "Yesterday",
    today: "Today so far",
    thisweek: "This week so far",
  }[result.period];
  const dates =
    result.period === "lastweek" || result.period === "thisweek"
      ? `${startDate} – ${endDate}`
      : startDate;
  const problemLabel = result.count === 1 ? "problem" : "problems";
  const sections = [
    `${periodLabel} for ${result.username}:\n${dates} (${result.timezone})`,
    `${result.count} unique Accepted ${problemLabel} found in available public history.`,
  ];

  if (result.questions.length === 0) {
    sections.push(
      "No matching problems were found in the available public history for this period.",
    );
  } else {
    sections.push(
      ...result.questions.map(
        (question, index) =>
          `${index + 1}. ${question.title}\n` +
          `https://leetcode.com/problems/${encodeURIComponent(question.titleSlug)}/`,
      ),
    );
  }

  if (result.mayBeIncomplete) {
    sections.push(
      "Coverage warning: LeetCode exposes only recent public Accepted submissions. " +
        "More problems may have been solved in this period.",
    );
  }

  return splitMessage(sections.join("\n\n"));
}
