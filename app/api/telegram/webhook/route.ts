import { handleTelegramWebhook } from "@/lib/telegram/webhook";

export async function POST(request: Request): Promise<Response> {
  return handleTelegramWebhook(request);
}
