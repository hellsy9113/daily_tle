import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorResponse } from "@/lib/http/api-error";
import {
  appUrl,
  trackingBot,
  registrationAvailable,
  registrationConfigurationIssues,
  requireRegistrationAvailable,
} from "@/lib/tracking/config";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://tracker.example");
  vi.stubEnv("TRACKING_REGISTRATION_ENABLED", "true");
  vi.stubEnv("DATABASE_URL", "postgres://database-placeholder");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "42:tracking-bot-placeholder");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_USERNAME", "tracking_bot");
  vi.stubEnv("TRACKING_TELEGRAM_WEBHOOK_SECRET", "webhook-placeholder");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_ID", "42");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_SECRET", "login-secret-placeholder");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("tracking deployment configuration", () => {
  it("opens registration with valid production settings", () => {
    expect(registrationAvailable()).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["APP_URL", "DATABASE_URL"])("requires %s for platform registration", (variable) => {
    vi.stubEnv(variable, "");
    expect(registrationAvailable()).toBe(false);
    expect(registrationConfigurationIssues()).toContainEqual({ variable, reason: "missing" });
  });
  it("allows website features without Telegram or Google credentials", () => {
    for (const key of [
      "TRACKING_TELEGRAM_BOT_TOKEN",
      "TRACKING_TELEGRAM_BOT_USERNAME",
      "TRACKING_TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_LOGIN_CLIENT_ID",
      "TELEGRAM_LOGIN_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ])
      vi.stubEnv(key, "");
    expect(registrationAvailable()).toBe(true);
    expect(() => trackingBot()).toThrow();
  });
  it.each([
    ["APP_URL", "http://localhost:3000"],
    ["APP_URL", "https://tracker.example/api/auth/telegram/callback"],
    ["APP_URL", "not-a-url"],
    ["TRACKING_REGISTRATION_ENABLED", '"true"'],
    ["TRACKING_REGISTRATION_ENABLED", "true "],
  ])("rejects invalid website configuration %s", (variable, value) => {
    vi.stubEnv(variable, value);
    expect(registrationAvailable()).toBe(false);
    expect(registrationConfigurationIssues()).toEqual(
      expect.arrayContaining([expect.objectContaining({ variable })]),
    );
  });
  it.each([
    ["TRACKING_TELEGRAM_BOT_TOKEN", "invalid-token-placeholder"],
    ["TRACKING_TELEGRAM_BOT_USERNAME", "https://t.me/tracking_bot"],
    ["TRACKING_TELEGRAM_WEBHOOK_SECRET", "contains spaces"],
  ])("validates %s when enabling the optional bot", (variable, value) => {
    vi.stubEnv(variable, value);
    expect(() => trackingBot()).toThrow();
    expect(registrationAvailable()).toBe(true);
  });
  it("keeps the original bot separate without disabling website features", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "42:tracking-bot-placeholder");
    expect(() => trackingBot()).toThrow();
    expect(registrationAvailable()).toBe(true);
  });

  it("allows HTTP localhost for development only", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(registrationAvailable()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(registrationAvailable()).toBe(true);
    expect(appUrl().origin).toBe("http://localhost:3000");
  });

  it("keeps configuration values out of logs and public errors", async () => {
    vi.stubEnv("APP_URL", "https://user:private-url-password@tracker.example");
    vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "private-invalid-token");
    let response: Response | undefined;
    try {
      requireRegistrationAvailable();
    } catch (error) {
      response = errorResponse(error);
    }
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({
      error: "Tracking setup is unavailable. Try again later.",
    });
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).toContain("APP_URL");
    expect(logs).not.toMatch(/private-url-password|private-invalid-token|login-secret-placeholder/);
  });
});
