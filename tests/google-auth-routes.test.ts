import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginGoogleLogin, finishGoogleLogin } from "@/lib/auth/google";
import { createSession, revokeSession } from "@/lib/auth/session";
import { GET as login } from "@/app/api/auth/google/login/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import type { Account } from "@/lib/db/schema";
vi.mock("@/lib/auth/google", () => ({
  beginGoogleLogin: vi.fn(),
  finishGoogleLogin: vi.fn(),
  GOOGLE_LOGIN_COOKIE: "google_login",
  GOOGLE_DESTINATION_COOKIE: "google_login_destination",
  GOOGLE_LOGIN_SECONDS: 600,
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  SESSION_COOKIE: "tracking_session",
  SESSION_SECONDS: 2592000,
  cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://tracker.example");
  vi.mocked(beginGoogleLogin).mockResolvedValue({
    token: "login-token",
    url: new URL("https://accounts.google.com/auth?state=private"),
  });
  vi.mocked(finishGoogleLogin).mockResolvedValue({
    account: { id: "google-account" } as Account,
    linked: false,
  });
  vi.mocked(createSession).mockResolvedValue("new-session");
});
describe("Google authentication routes", () => {
  it("uses the canonical origin and an allowlisted feature destination", async () => {
    const alias = await login(
      new NextRequest("https://preview.example/api/auth/google/login?next=daily-grind"),
    );
    expect(alias.headers.get("location")).toBe(
      "https://tracker.example/api/auth/google/login?next=%2Ffeature%3Fplatform%3Ddaily-grind",
    );
    expect(beginGoogleLogin).not.toHaveBeenCalled();
    const response = await login(
      new NextRequest(
        "https://tracker.example/api/auth/google/login?next=https://attacker.example",
      ),
    );
    expect(decodeURIComponent(response.headers.get("set-cookie")!)).toContain(
      "google_login_destination=/feature",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires a website session to start linking and binds it to the attempt", async () => {
    expect(
      (await login(new NextRequest("https://tracker.example/api/auth/google/login?link=1"))).status,
    ).toBe(401);
    await login(
      new NextRequest("https://tracker.example/api/auth/google/login?link=1", {
        headers: { cookie: "tracking_session=existing-session" },
      }),
    );
    expect(beginGoogleLogin).toHaveBeenCalledExactlyOnceWith("existing-session");
  });
  it("rotates the session for Google sign-in and clears its one-use cookies", async () => {
    const response = await callback(
      new NextRequest("https://tracker.example/api/auth/google/callback?code=code", {
        headers: {
          cookie:
            "google_login=attempt; google_login_destination=/feature?platform=articles; tracking_session=old-session",
        },
      }),
    );
    expect(finishGoogleLogin).toHaveBeenCalledWith(
      expect.objectContaining({ search: "?code=code" }),
      "attempt",
      "old-session",
    );
    expect(revokeSession).toHaveBeenCalledWith("old-session");
    expect(createSession).toHaveBeenCalledWith("google-account");
    expect(response.headers.get("location")).toBe(
      "https://tracker.example/feature?platform=articles",
    );
    expect(response.headers.get("set-cookie")).toContain("tracking_session=new-session");
    expect(response.headers.get("set-cookie")).toMatch(/google_login=;[^,]*Max-Age=0/);
  });
  it("preserves the current session when linking succeeds", async () => {
    vi.mocked(finishGoogleLogin).mockResolvedValue({
      account: { id: "existing" } as Account,
      linked: true,
    });
    const response = await callback(
      new NextRequest("https://tracker.example/api/auth/google/callback", {
        headers: { cookie: "google_login_destination=/profile" },
      }),
    );
    expect(response.headers.get("location")).toBe("https://tracker.example/profile");
    expect(createSession).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });
  it("returns failures to the local page without creating a session or leaking tokens", async () => {
    vi.mocked(finishGoogleLogin).mockRejectedValue(new Error("private-provider-error"));
    const response = await callback(
      new NextRequest("https://tracker.example/api/auth/google/callback?code=private-code", {
        headers: { cookie: "google_login_destination=https://attacker.example" },
      }),
    );
    expect(response.headers.get("location")).toBe(
      "https://tracker.example/feature?error=google-login",
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toMatch(/google_login=;[^,]*Max-Age=0/);
  });
});
