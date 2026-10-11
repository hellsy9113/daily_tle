import { ApiError, errorResponse } from "@/lib/http/api-error";
import { sendTelegramMessage } from "./client";
import { parseCommand, parseTextMessage } from "./commands";
import { getCommandReplies } from "./replies";

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      throw new ApiError(401, "Unauthorized");
    }
    let update: unknown;
    try {
      update = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
    const message = parseTextMessage(update);
    if (!message) return Response.json({ ok: true });
    const command = parseCommand(message.text);
    if (command.type === "ignored") return Response.json({ ok: true });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new ApiError(500, "TELEGRAM_BOT_TOKEN is not configured");
    const replies = await getCommandReplies(command);
    for (const reply of replies) {
      await sendTelegramMessage(token, message.chatId, reply);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
