import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import type { Account } from "@/lib/db/schema";
import { requireAccount } from "@/lib/auth/session";
import {
  registerUsername,
  trackingStatus,
  createConnectionLink,
} from "@/lib/tracking/registration";
import { GET, POST } from "@/app/api/tracking/route";
import { POST as link } from "@/app/api/tracking/telegram-link/route";
import { GET as cron } from "@/app/api/cron/tracking/daily/route";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({
  registerUsername: vi.fn(),
  trackingStatus: vi.fn(),
  createConnectionLink: vi.fn(),
}));
const ownAccount: Account = {
  theme: null,
  notesRegisteredAt: null,
  id: "own-account",
  telegramId: 101,
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
  createdAt: new Date(),
  registeredAt: null,
  connectedAt: null,
};
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/tracking", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.mocked(requireAccount).mockResolvedValue(ownAccount);
  vi.mocked(trackingStatus).mockResolvedValue({
    username: null,
    connected: false,
    status: "pending",
    lastDelivery: null,
    paused: false,
    registrationId: null,
  });
});

describe("authenticated tracking endpoints", () => {
  it("returns only the signed-in account, regardless of query parameters", async () => {
    const response = await GET(new Request("http://localhost:3000/api/tracking?accountId=other"));
    expect(response.status).toBe(200);
    expect(trackingStatus).toHaveBeenCalledWith(ownAccount);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires authentication for reads and writes", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect((await GET(new Request("http://localhost:3000/api/tracking"))).status).toBe(401);
    expect(
      (await POST(request({ username: "test", acceptedAgreement: true, agreementVersion: "1" })))
        .status,
    ).toBe(401);
    expect(registerUsername).not.toHaveBeenCalled();
  });
  it("rejects attempts to supply another account identifier", async () => {
    expect((await POST(request({ username: "test", accountId: "other" }))).status).toBe(400);
    expect(registerUsername).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutation before accessing the account", async () => {
    expect(
      (
        await POST(
          request(
            { username: "test", acceptedAgreement: true, agreementVersion: "1" },
            "https://other.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(requireAccount).not.toHaveBeenCalled();
  });
  it("registers using the authenticated identity", async () => {
    vi.mocked(registerUsername).mockResolvedValue({
      username: "canonical",
      connected: false,
      status: "pending",
      lastDelivery: null,
      paused: false,
      registrationId: null,
    });
    expect(
      (await POST(request({ username: "test", acceptedAgreement: true, agreementVersion: "1" })))
        .status,
    ).toBe(201);
    expect(registerUsername).toHaveBeenCalledWith(ownAccount, "test");
  });
  it("preserves registration conflicts", async () => {
    vi.mocked(registerUsername).mockRejectedValue(new ApiError(409, "Already registered."));
    expect(
      (await POST(request({ username: "test", acceptedAgreement: true, agreementVersion: "1" })))
        .status,
    ).toBe(409);
  });
  it("creates a connection link only for the session account", async () => {
    vi.mocked(createConnectionLink).mockResolvedValue({
      url: "https://t.me/bot?start=test",
      expiresAt: new Date().toISOString(),
    });
    expect((await link(request({}))).status).toBe(200);
    expect(createConnectionLink).toHaveBeenCalledWith(ownAccount);
  });
  it("rejects cron calls without the separate bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test");
    expect((await cron(new Request("http://localhost:3000/api/cron/tracking/daily"))).status).toBe(
      401,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
