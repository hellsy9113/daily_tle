import "server-only";
import { ApiError } from "@/lib/http/api-error";

export function appUrl(): URL {
  const value =
    process.env.APP_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!value) throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.hostname === "localhost" &&
        url.protocol === "http:"
      ))
  ) {
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
  }
  return url;
}

export function trackingBot() {
  const token = process.env.TRACKING_TELEGRAM_BOT_TOKEN;
  const username = process.env.TRACKING_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const secret = process.env.TRACKING_TELEGRAM_WEBHOOK_SECRET;
  if (
    !token ||
    !/^\d+:[A-Za-z0-9_-]+$/.test(token) ||
    !username ||
    !/^[A-Za-z0-9_]+$/.test(username) ||
    !secret ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(secret) ||
    token === process.env.TELEGRAM_BOT_TOKEN
  ) {
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
  }
  return { token, username, secret };
}

export function registrationAvailable(): boolean {
  try {
    appUrl();
    trackingBot();
    return (
      process.env.TRACKING_REGISTRATION_ENABLED === "true" &&
      Boolean(
        process.env.DATABASE_URL &&
        process.env.TELEGRAM_LOGIN_CLIENT_ID &&
        process.env.TELEGRAM_LOGIN_CLIENT_SECRET,
      )
    );
  } catch {
    return false;
  }
}

export function requireRegistrationAvailable(): void {
  if (!registrationAvailable())
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
}
