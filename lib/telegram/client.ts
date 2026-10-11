import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

const REQUEST_TIMEOUT_MS = 10_000;

export async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  let response: Response;
  let result: unknown;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    result = await response.json();
  } catch {
    throw new ApiError(502, "Telegram request failed");
  }
  if (!response.ok || !isRecord(result) || result.ok !== true) {
    throw new ApiError(502, "Telegram could not send the message");
  }
}
