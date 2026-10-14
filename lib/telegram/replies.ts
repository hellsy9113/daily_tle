import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getLastWeekSolvedQuestions } from "@/lib/leetcode/last-week-solved";
import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";
import { formatSolvedQuestions } from "./format-solved-questions";
import { formatSubmissions } from "./format-submissions";
import type { BotCommand } from "./types";

const commandHelp = [
  "Available commands:",
  "/start — About this bot and what you need.",
  "/command — Show this command list.",
  "hello — Get a welcome reply.",
  "name:your_leetcode_username — Recent submissions, verdicts, languages, and problem links.",
  "lastday:your_leetcode_username — Unique Accepted problems from yesterday.",
  "lastweek:your_leetcode_username — Unique Accepted problems from the previous Monday–Sunday week.",
  "",
  "Replace your_leetcode_username with your public LeetCode username. Send one command per message.",
  "Day and week reports use Asia/Kolkata time and available public Accepted history. A coverage warning appears when history may be incomplete.",
].join("\n");

const startMessage = [
  "Welcome to LeetCode Tracker!",
  "",
  "Check your LeetCode practice on demand, right here in Telegram. See recent submissions, review yesterday's solved problems, or catch up on last week's progress.",
  "",
  "What you need:",
  "• A public LeetCode username with accessible submission history.",
  "• Send one command at a time in this chat. No LeetCode password or website registration is needed.",
  "",
  "To begin, send name:your_leetcode_username, replacing the username with yours.",
  "Send /command to see all available commands and their usage.",
].join("\n");

export async function getCommandReplies(command: BotCommand): Promise<string[]> {
  try {
    switch (command.type) {
      case "start":
        return [startMessage];
      case "help":
        return [commandHelp];
      case "greeting":
        return ["welcome"];
      case "usage":
        return [commandHelp];
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
