import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getLastWeekSolvedQuestions } from "@/lib/leetcode/last-week-solved";
import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";
import { formatSolvedQuestions } from "./format-solved-questions";
import { formatSubmissions } from "./format-submissions";
import type { BotCommand } from "./types";

export async function getCommandReplies(command: BotCommand): Promise<string[]> {
  try {
    switch (command.type) {
      case "greeting":
        return ["welcome"];
      case "usage":
        return [
          "Send one command per message:\nhello\nname:your_leetcode_username\n" +
            "lastweek:your_leetcode_username\nlastday:your_leetcode_username",
        ];
      case "submissions": {
        const data = await getRecentSubmissions(command.username);
        return formatSubmissions(command.username, data);
      }
      case "lastweek":
        return formatSolvedQuestions(await getLastWeekSolvedQuestions(command.username));
      case "lastday":
        return formatSolvedQuestions(await getLastDaySolvedQuestions(command.username));
      case "ignored":
        return [];
    }
  } catch {
    return [
      "Could not fetch recent submissions. Check your LeetCode username and try again shortly.",
    ];
  }
}
