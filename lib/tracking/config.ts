import "server-only";
import { ApiError } from "@/lib/http/api-error";

type ConfigurationIssue = { variable: string; reason: string };

class TrackingConfigurationError extends ApiError {
  constructor(readonly issues: ConfigurationIssue[]) {
    super(503, "Tracking setup is unavailable. Try again later.");
  }
}

export function appUrl(): URL {
  const value =
    process.env.APP_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!value) throw new TrackingConfigurationError([{ variable: "APP_URL", reason: "missing" }]);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TrackingConfigurationError([{ variable: "APP_URL", reason: "invalid URL" }]);
  }
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
    throw new TrackingConfigurationError([
      {
        variable: "APP_URL",
        reason:
          "must be an HTTPS website origin without a path; HTTP localhost is development-only",
      },
    ]);
  }
  return url;
}

export function trackingBot() {
  const token = process.env.TRACKING_TELEGRAM_BOT_TOKEN;
  const username = process.env.TRACKING_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const secret = process.env.TRACKING_TELEGRAM_WEBHOOK_SECRET;
  const issues: ConfigurationIssue[] = [];
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token))
    issues.push({
      variable: "TRACKING_TELEGRAM_BOT_TOKEN",
      reason: token ? "invalid bot token format" : "missing",
    });
  if (token && token === process.env.TELEGRAM_BOT_TOKEN)
    issues.push({
      variable: "TRACKING_TELEGRAM_BOT_TOKEN",
      reason: "must belong to a different bot than TELEGRAM_BOT_TOKEN",
    });
  if (!username || !/^[A-Za-z0-9_]+$/.test(username))
    issues.push({
      variable: "TRACKING_TELEGRAM_BOT_USERNAME",
      reason: username ? "must be a bot username, not a URL" : "missing",
    });
  if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret))
    issues.push({
      variable: "TRACKING_TELEGRAM_WEBHOOK_SECRET",
      reason: secret ? "must contain 1–256 letters, digits, underscores, or hyphens" : "missing",
    });
  if (issues.length || !token || !username || !secret) throw new TrackingConfigurationError(issues);
  return { token, username, secret };
}

export function registrationConfigurationIssues(): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  for (const validate of [appUrl, trackingBot]) {
    try {
      validate();
    } catch (error) {
      if (!(error instanceof TrackingConfigurationError)) throw error;
      issues.push(...error.issues);
    }
  }
  if (process.env.TRACKING_REGISTRATION_ENABLED !== "true")
    issues.push({ variable: "TRACKING_REGISTRATION_ENABLED", reason: "must be exactly true" });
  for (const variable of [
    "DATABASE_URL",
    "TELEGRAM_LOGIN_CLIENT_ID",
    "TELEGRAM_LOGIN_CLIENT_SECRET",
  ]) {
    if (!process.env[variable]?.trim()) issues.push({ variable, reason: "missing" });
  }
  if (
    process.env.TELEGRAM_LOGIN_CLIENT_ID &&
    /^\d+:[A-Za-z0-9_-]+$/.test(process.env.TRACKING_TELEGRAM_BOT_TOKEN ?? "") &&
    process.env.TELEGRAM_LOGIN_CLIENT_ID !== process.env.TRACKING_TELEGRAM_BOT_TOKEN?.split(":")[0]
  )
    issues.push({
      variable: "TELEGRAM_LOGIN_CLIENT_ID",
      reason: "must match the tracking bot ID",
    });
  return issues;
}

export function registrationAvailable(): boolean {
  const issues = registrationConfigurationIssues();
  if (issues.length) {
    // Only variable names and fixed reasons reach server logs; never log their values.
    console.warn("[tracking:setup] Registration unavailable", { issues });
  }
  return issues.length === 0;
}

export function requireRegistrationAvailable(): void {
  if (!registrationAvailable())
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
}
