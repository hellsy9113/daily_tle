import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";
import { formatSubmissions } from "./format-submissions";
import type { BotCommand } from "./types";

export async function getCommandReplies(command: BotCommand): Promise<string[]> {
  switch (command.type) {
    case "greeting":
      return ["welcome"];
    case "usage":
      return ["Send name:your_leetcode_username (for example, name:leetcode)."];
    case "submissions":
      try {
        const data = await getRecentSubmissions(command.username);
        return formatSubmissions(command.username, data);
      } catch {
        return [
          "Could not fetch recent submissions. Check your LeetCode username and try again shortly.",
        ];
      }
    case "ignored":
      return [];
  }
}
