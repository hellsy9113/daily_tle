import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import type { Account } from "@/lib/db/schema";
import { TelegramLoginFailure, logLoginFailure } from "@/lib/auth/login-errors";
import { beginTelegramLogin, finishTelegramLogin } from "@/lib/auth/telegram";
import { createSession, revokeSession } from "@/lib/auth/session";
import { GET as login } from "@/app/api/auth/telegram/login/route";
import { GET as callback } from "@/app/api/auth/telegram/callback/route";

vi.mock("@/lib/auth/telegram", () => ({
  beginTelegramLogin: vi.fn(),
  finishTelegramLogin: vi.fn(),
  LOGIN_COOKIE: "tracking_login",
  LOGIN_SECONDS: 600,
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  SESSION_COOKIE: "tracking_session",
  SESSION_SECONDS: 2592000,
  cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
}));

const origin = "https://tracker.example";
const loginToken = "l".repeat(43);
const sessionToken = "s".repeat(43);
const account: Account = {
  theme: null,
  id: "account-id",
  telegramId: 123,
  leetcodeUsername: null,
  gfgUsername: null,
  gfgUsernameKey: null,
  gfgRegisteredAt: null,
  hackerRankUsername: null,
  hackerRankUsernameKey: null,
  hackerRankRegisteredAt: null,
  usernameKey: null,
  chatId: null,
  status: "pending",
  registeredAt: null,
  connectedAt: null,
  createdAt: new Date(),
};
function callbackRequest() {
  return new NextRequest(
    `${origin}/api/auth/telegram/callback?code=private-code&state=private-state`,
    {
      headers: { cookie: `tracking_login=${loginToken}; tracking_session=old-session` },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", origin);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(beginTelegramLogin).mockResolvedValue({
    token: loginToken,
    url: new URL("https://oauth.telegram.org/auth?state=private-state"),
  });
  vi.mocked(finishTelegramLogin).mockResolvedValue(account);
  vi.mocked(createSession).mockResolvedValue(sessionToken);
  vi.mocked(revokeSession).mockResolvedValue(undefined);
});

describe("Telegram authentication routes", () => {
  it.each(["leetcode", "gfg"])("preserves the %s service through sign-in", async (platform) => {
    const alias = await login(
      new NextRequest(`https://preview.example/api/auth/telegram/login?next=${platform}`),
    );
    expect(alias.headers.get("location")).toBe(
      `${origin}/api/auth/telegram/login?next=${platform}`,
    );
    const started = await login(
      new NextRequest(`${origin}/api/auth/telegram/login?next=${platform}`),
    );
    expect(decodeURIComponent(started.headers.get("set-cookie")!)).toContain(
      `tracking_login_destination=/feature?platform=${platform}`,
    );
    const response = await callback(
      new NextRequest(`${origin}/api/auth/telegram/callback?code=private-code`, {
        headers: {
          cookie: `tracking_login=${loginToken}; tracking_login_destination=/feature?platform=${platform}`,
        },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/feature?platform=${platform}`);
  });
  it("retains the Feature destination when moving an alias to the canonical origin", async () => {
    const response = await login(
      new NextRequest("https://preview.example/api/auth/telegram/login?next=feature"),
    );
    expect(response.headers.get("location")).toBe(`${origin}/api/auth/telegram/login?next=feature`);
    expect(beginTelegramLogin).not.toHaveBeenCalled();
  });
  it("returns a verified feature sign-in to the Feature page", async () => {
    const response = await callback(
      new NextRequest(`${origin}/api/auth/telegram/callback?code=private-code`, {
        headers: { cookie: `tracking_login=${loginToken}; tracking_login_destination=/feature` },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/feature`);
    expect(response.headers.get("set-cookie")).toContain("tracking_login_destination=;");
  });
  it("preserves HackerRank selection through canonical login and callback", async () => {
    const alias = await login(
      new NextRequest("https://preview.example/api/auth/telegram/login?next=hackerrank"),
    );
    expect(alias.headers.get("location")).toBe(`${origin}/api/auth/telegram/login?next=hackerrank`);
    const started = await login(
      new NextRequest(`${origin}/api/auth/telegram/login?next=hackerrank`),
    );
    expect(decodeURIComponent(started.headers.get("set-cookie")!)).toContain(
      "tracking_login_destination=/feature?platform=hackerrank",
    );
    const response = await callback(
      new NextRequest(`${origin}/api/auth/telegram/callback?code=private-code`, {
        headers: {
          cookie: `tracking_login=${loginToken}; tracking_login_destination=/feature?platform=hackerrank`,
        },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/feature?platform=hackerrank`);
  });
  it("retains the HackerRank tab when authentication fails", async () => {
    vi.mocked(finishTelegramLogin).mockRejectedValue(new Error("Verification failed"));
    const response = await callback(
      new NextRequest(`${origin}/api/auth/telegram/callback`, {
        headers: {
          cookie: `tracking_login=${loginToken}; tracking_login_destination=/feature?platform=hackerrank`,
        },
      }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/feature?platform=hackerrank&error=login`,
    );
  });
  it("does not accept an arbitrary login destination", async () => {
    const response = await callback(
      new NextRequest(`${origin}/api/auth/telegram/callback?code=private-code`, {
        headers: {
          cookie: `tracking_login=${loginToken}; tracking_login_destination=https://attacker.example`,
        },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/feature`);
  });
  it("moves aliases to the canonical origin before creating a login or cookie", async () => {
    const response = await login(
      new NextRequest("https://preview.example/api/auth/telegram/login"),
    );
    expect(response.headers.get("location")).toBe(`${origin}/api/auth/telegram/login`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(beginTelegramLogin).not.toHaveBeenCalled();
  });

  it("sets the private login cookie at the callback's origin and disables caching", async () => {
    const response = await login(new NextRequest(`${origin}/api/auth/telegram/login`));
    expect(response.headers.get("location")).toBe(
      "https://oauth.telegram.org/auth?state=private-state",
    );
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain(`tracking_login=${loginToken}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("logs failed login starts without exposing raw errors", async () => {
    vi.mocked(beginTelegramLogin).mockRejectedValue(
      new ApiError(503, "Tracking setup is unavailable."),
    );
    const response = await login(new NextRequest(`${origin}/api/auth/telegram/login`));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledWith("[telegram:auth] Sign-in failed", {
      stage: "login_start",
      reason: "unexpected_error",
    });
  });

  it("creates a session after verification and clears the temporary cookie", async () => {
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toBe(`${origin}/feature`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(finishTelegramLogin).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/auth/telegram/callback" }),
      loginToken,
    );
    expect(revokeSession).toHaveBeenCalledWith("old-session");
    expect(createSession).toHaveBeenCalledWith(account.id);
    expect(response.headers.get("set-cookie")).toContain(`tracking_session=${sessionToken}`);
    expect(response.headers.get("set-cookie")).toContain("tracking_login=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("identifies verification failures while retaining the generic public error", async () => {
    vi.mocked(finishTelegramLogin).mockRejectedValue(
      new TelegramLoginFailure("token_exchange", "invalid_client", 502),
    );
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toBe(`${origin}/feature?error=login`);
    expect(response.headers.get("set-cookie")).not.toContain(sessionToken);
    expect(createSession).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[telegram:auth] Sign-in failed", {
      stage: "token_exchange",
      reason: "invalid_client",
    });
    expect(response.headers.get("location")).not.toContain("invalid_client");
  });

  it.each([
    ["session_revoke", revokeSession],
    ["session_create", createSession],
  ] as const)("identifies database failures during %s", async (stage, operation) => {
    vi.mocked(operation).mockRejectedValue({ cause: { code: "42P01", query: "private-query" } });
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toBe(`${origin}/feature?error=login`);
    expect(console.error).toHaveBeenCalledWith("[telegram:auth] Sign-in failed", {
      stage,
      reason: "42P01",
    });
  });

  it("never logs codes, cookies, profile data, or raw upstream descriptions", () => {
    logLoginFailure(
      {
        message: "private-code private-cookie private-profile",
        code: "private-code",
        cause: { error: "invalid_client", error_description: "private-client-secret" },
      },
      "token_exchange",
    );
    logLoginFailure(new TelegramLoginFailure("identity", "private-profile"), "identity");
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).toContain("invalid_client");
    expect(logs).not.toMatch(/private-code|private-cookie|private-profile|private-client-secret/);
  });
});
