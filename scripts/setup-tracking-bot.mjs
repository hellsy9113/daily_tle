import { loadDatabaseEnvironment } from "./database-env.mjs";

loadDatabaseEnvironment();
const token = process.env.TRACKING_TELEGRAM_BOT_TOKEN;
const username = process.env.TRACKING_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
const secret = process.env.TRACKING_TELEGRAM_WEBHOOK_SECRET;
const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
let base;
try {
  base = new URL(process.env.APP_URL ?? "");
} catch {
  /* validated below */
}
if (
  !token ||
  token === process.env.TELEGRAM_BOT_TOKEN ||
  !username ||
  !secret ||
  !/^[A-Za-z0-9_-]{1,256}$/.test(secret) ||
  clientId !== token.split(":")[0] ||
  !base ||
  base.protocol !== "https:" ||
  base.pathname !== "/" ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
) {
  console.error(
    "Configure the second bot, matching Telegram login client ID, webhook secret, and HTTPS APP_URL before setup.",
  );
  process.exit(1);
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error("Tracking bot setup failed.");
  return result.result;
}
try {
  const bot = await telegram("getMe");
  if (bot.username?.toLowerCase() !== username.toLowerCase() || String(bot.id) !== clientId)
    throw new Error("Tracking bot identity does not match configuration.");
  const url = new URL("/api/telegram/tracking/webhook", base).href;
  await telegram("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member"],
    max_connections: 10,
  });
  const info = await telegram("getWebhookInfo");
  if (info.url !== url) throw new Error("Tracking webhook verification failed.");
  console.log(`Second bot webhook configured: ${url}`);
  console.log(
    "Sign in, connect the bot, and verify a test report before enabling public registration.",
  );
} catch {
  console.error(
    "Tracking bot setup failed. Check credentials, matching bot identity, and deployment availability.",
  );
  process.exitCode = 1;
}
