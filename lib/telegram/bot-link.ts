import "server-only";

export function queryBotUrl(): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return username && /^[A-Za-z0-9_]{5,32}$/.test(username)
    ? `https://t.me/${username}`
    : "https://t.me/todo1245bot";
}
