import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { trackingBot } from "./config";

export class TrackingTelegramError extends ApiError {
  constructor(
    readonly kind: "blocked" | "rate_limit" | "upstream",
    readonly retryAfter = 60,
  ) {
    super(502, "The tracking message could not be delivered.");
  }
}

export async function sendTrackingMessage(chatId: number, text: string): Promise<void> {
  const { token } = trackingBot();
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    body = await response.json();
  } catch {
    throw new TrackingTelegramError("upstream");
  }
  if (response.ok && isRecord(body) && body.ok === true) return;
  const code =
    isRecord(body) && typeof body.error_code === "number" ? body.error_code : response.status;
  if (code === 403) throw new TrackingTelegramError("blocked");
  if (code === 429) {
    const delay =
      isRecord(body) &&
      isRecord(body.parameters) &&
      typeof body.parameters.retry_after === "number" &&
      Number.isFinite(body.parameters.retry_after)
        ? Math.max(1, Math.ceil(body.parameters.retry_after))
        : 60;
    throw new TrackingTelegramError("rate_limit", delay);
  }
  throw new TrackingTelegramError("upstream");
}
