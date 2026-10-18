import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getLastWeekSolvedQuestions } from "@/lib/leetcode/last-week-solved";
import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";
import { getUserProfile } from "@/lib/leetcode/user-profile";
import { getRecentSolvedQuestions } from "@/lib/leetcode/recent-solved";
import { getCurrentSolvedQuestions } from "@/lib/leetcode/current-solved";
import { formatProfile } from "./format-profile";
import { formatRecentSolved } from "./format-recent-solved";
import { formatSolvedQuestions } from "./format-solved-questions";
import { formatSubmissions } from "./format-submissions";
import type { BotCommand } from "./types";

const commandHelp = [
  "LeetCode queries:",
  "profile:your_leetcode_username — Solved totals by difficulty and profile ranking.",
  "accepted:your_leetcode_username — Unique recently Accepted problems and their links.",
  "name:your_leetcode_username — Recent submissions, verdicts, languages, and problem links.",
  "lastday:your_leetcode_username — Unique Accepted problems from yesterday.",
  "today:your_leetcode_username — Unique Accepted problems since midnight today.",
  "thisweek:your_leetcode_username — Unique Accepted problems since Monday this week.",
  "lastweek:your_leetcode_username — Unique Accepted problems from the previous Monday–Sunday week.",
  "",
  "Replace your_leetcode_username with your public LeetCode username. Send one command per message.",
  "Day and week reports use Asia/Kolkata time and available public Accepted history. A coverage warning appears when history may be incomplete.",
].join("\n");

const startMessage = [
  "Welcome to Track.it's LeetCode query bot!",
  "",
  "Check your LeetCode practice on demand, right here in Telegram. See recent submissions, review yesterday's solved problems, or catch up on last week's progress.",
  "",
  "What you need:",
  "• A public LeetCode username with accessible submission history.",
  "• Send one command at a time in this chat. No LeetCode password or website registration is needed.",
  "",
  "Navigation commands:",
  "/start — About this bot and what you need.",
  "/command — All LeetCode queries, with descriptions and examples.",
  "/help — Show the query guide.",
  "hello — Get a welcome reply.",
  "",
  "Open /command when you're ready to look up a username.",
  "This bot answers on demand. Automatic morning reports use the separate Daily Grind connection on the website.",
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
      case "profile":
        return formatProfile(command.username, await getUserProfile(command.username));
      case "accepted":
        return formatRecentSolved(await getRecentSolvedQuestions(command.username));
      case "today":
      case "thisweek":
        return formatSolvedQuestions(
          await getCurrentSolvedQuestions(command.username, command.type),
        );
      case "ignored":
        return [];
    }
  } catch {
    return ["Could not fetch LeetCode data. Check your username and try again shortly."];
  }
}
