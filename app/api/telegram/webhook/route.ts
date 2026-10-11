type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (
    secret &&
    request.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate | null;

  try {
    update = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = update?.message;
  const chatId = message?.chat?.id;

  if (
    typeof message?.text !== "string" ||
    message.text.trim().toLowerCase() !== "hello" ||
    typeof chatId !== "number" ||
    !Number.isSafeInteger(chatId)
  ) {
    return Response.json({ ok: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return Response.json(
      { error: "TELEGRAM_BOT_TOKEN is not configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "welcome" }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = await response.json();

    if (!response.ok || result?.ok !== true) {
      return Response.json(
        { error: "Telegram could not send the message" },
        { status: 502 },
      );
    }
  } catch {
    return Response.json(
      { error: "Telegram request failed" },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
