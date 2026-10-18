import { isRecord } from "@/lib/http/validation";
import { parseUsername } from "@/lib/leetcode/validation";
import type { BotCommand, TelegramTextMessage } from "./types";

export function parseTextMessage(update: unknown): TelegramTextMessage | null {
  if (!isRecord(update) || !isRecord(update.message)) return null;
  const message = update.message;
  if (
    typeof message.text !== "string" ||
    !isRecord(message.chat) ||
    typeof message.chat.id !== "number" ||
    !Number.isSafeInteger(message.chat.id)
  ) {
    return null;
  }
  return { chatId: message.chat.id, text: message.text };
}

export function parseCommand(value: string): BotCommand {
  const text = value.trim();
  const slashCommand = /^\/(start|command|help)(?:@[a-z0-9_]+)?(?:\s+[^;]+)?$/i.exec(text);
  if (slashCommand) {
    return { type: slashCommand[1].toLowerCase() === "start" ? "start" : "help" };
  }
  if (
    text.includes(";") &&
    /^(hello\s*;|(?:name|lastweek|lastday|profile|accepted|today|thisweek)\s*:)/i.test(text)
  ) {
    return { type: "usage" };
  }
  if (text.toLowerCase() === "hello") return { type: "greeting" };
  const match = /^(name|lastweek|lastday|profile|accepted|today|thisweek)\s*:/i.exec(text);
  if (!match) return { type: "ignored" };

  try {
    const username = parseUsername(text.slice(text.indexOf(":") + 1));
    switch (match[1].toLowerCase()) {
      case "name":
        return { type: "submissions", username };
      case "lastweek":
        return { type: "lastweek", username };
      case "lastday":
        return { type: "lastday", username };
      case "profile":
        return { type: "profile", username };
      case "accepted":
        return { type: "accepted", username };
      case "today":
        return { type: "today", username };
      case "thisweek":
        return { type: "thisweek", username };
      default:
        return { type: "ignored" };
    }
  } catch {
    return { type: "usage" };
  }
}
