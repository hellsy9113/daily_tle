export interface TelegramTextMessage {
  chatId: number;
  text: string;
}

export type BotCommand =
  | { type: "greeting" }
  | { type: "submissions"; username: string }
  | { type: "lastweek"; username: string }
  | { type: "lastday"; username: string }
  | { type: "usage" }
  | { type: "ignored" };
