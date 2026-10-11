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
  if (text.toLowerCase() === "hello") return { type: "greeting" };
  if (!/^name\s*:/i.test(text)) return { type: "ignored" };
  try {
    return { type: "submissions", username: parseUsername(text.slice(text.indexOf(":") + 1)) };
  } catch {
    return { type: "usage" };
  }
}
