export interface TelegramTextMessage {
  chatId: number;
  text: string;
}

export type BotCommand =
  | { type: "start" }
  | { type: "help" }
  | { type: "greeting" }
  | { type: "submissions"; username: string }
  | { type: "lastweek"; username: string }
  | { type: "lastday"; username: string }
  | { type: "profile" | "accepted" | "today" | "thisweek"; username: string }
  | { type: "usage" }
  | { type: "ignored" };
