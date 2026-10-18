import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/db/schema";
import { requireAccount } from "@/lib/auth/session";
import { ApiError } from "@/lib/http/api-error";
import { profileSummary } from "@/lib/profile";
import { revokeService, setServicePaused } from "@/lib/tracking/services";
import { registerUsername, trackingStatus } from "@/lib/tracking/registration";
import { registerGfg } from "@/lib/gfg/service";
import { registerHackerRank } from "@/lib/hackerrank/service";
import { GET as profile, PATCH as theme } from "@/app/api/profile/route";
import { PATCH as pause, DELETE as revoke } from "@/app/api/tracking/services/[platform]/route";
import { POST as leetcode } from "@/app/api/tracking/route";
import { POST as gfg } from "@/app/api/tracking/gfg/route";
import { POST as hackerrank } from "@/app/api/tracking/hackerrank/route";

const database = vi.hoisted(() => ({ update: vi.fn(), set: vi.fn(), where: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: () => database }));
vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/profile", () => ({ profileSummary: vi.fn() }));
vi.mock("@/lib/tracking/services", () => ({ revokeService: vi.fn(), setServicePaused: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({
  trackingStatus: vi.fn(),
  registerUsername: vi.fn(),
}));
vi.mock("@/lib/gfg/service", () => ({ registerGfg: vi.fn() }));
vi.mock("@/lib/hackerrank/service", () => ({ registerHackerRank: vi.fn() }));
const account = { id: "own-account" } as Account;
const registrationId = "10000000-0000-4000-8000-000000000001";
const status = {
  username: "own-profile",
  connected: true,
  status: "active",
  paused: false,
  registrationId,
  lastDelivery: null,
} as const;
const context = (platform = "leetcode") => ({ params: Promise.resolve({ platform }) });
const request = (body: unknown, method = "PATCH", origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/profile", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.mocked(requireAccount).mockResolvedValue(account);
  vi.mocked(setServicePaused).mockResolvedValue(account);
  vi.mocked(revokeService).mockResolvedValue(account);
  vi.mocked(trackingStatus).mockResolvedValue(status);
  for (const register of [registerUsername, registerGfg, registerHackerRank])
    vi.mocked(register).mockResolvedValue(status);
  database.update.mockReturnValue(database);
  database.set.mockReturnValue(database);
  database.where.mockResolvedValue([]);
});

describe("profile and platform service authorization", () => {
  it("returns private profile data for the session only", async () => {
    vi.mocked(profileSummary).mockResolvedValue({ telegramId: 101 } as Awaited<
      ReturnType<typeof profileSummary>
    >);
    const response = await profile(new Request("http://localhost/api/profile?accountId=other"));
    expect(response.status).toBe(200);
    expect(profileSummary).toHaveBeenCalledExactlyOnceWith(account);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["light", "dark"])("saves %s mode for the session account", async (value) => {
    const response = await theme(request({ theme: value }));
    expect(response.status).toBe(200);
    expect(database.set).toHaveBeenCalledWith({ theme: value });
    expect(await response.json()).toEqual({ theme: value });
  });
  it.each([{ theme: "system" }, { theme: "dark", accountId: "other" }, {}, null])(
    "rejects unsupported profile settings %j",
    async (body) => {
      expect((await theme(request(body))).status).toBe(400);
      expect(database.update).not.toHaveBeenCalled();
    },
  );
  it.each([true, false])("changes only the session's platform pause to %s", async (paused) => {
    expect((await pause(request({ registrationId, paused }), context("gfg"))).status).toBe(200);
    expect(setServicePaused).toHaveBeenCalledExactlyOnceWith(
      account.id,
      "gfg",
      registrationId,
      paused,
    );
  });
  it("requires explicit deletion confirmation and rejects account selectors", async () => {
    for (const body of [
      { registrationId },
      { registrationId, confirmPermanentDeletion: false },
      { registrationId, confirmPermanentDeletion: true, accountId: "other" },
    ]) {
      expect((await revoke(request(body, "DELETE"), context())).status).toBe(400);
    }
    expect(revokeService).not.toHaveBeenCalled();
    expect(
      (
        await revoke(
          request({ registrationId, confirmPermanentDeletion: true }, "DELETE"),
          context("hackerrank"),
        )
      ).status,
    ).toBe(200);
    expect(revokeService).toHaveBeenCalledExactlyOnceWith(account.id, "hackerrank", registrationId);
  });
  it("rejects invalid platforms, registration IDs, malformed JSON, and stale registrations", async () => {
    expect((await pause(request({ registrationId, paused: true }), context("other"))).status).toBe(
      400,
    );
    expect((await pause(request({ registrationId: "bad", paused: true }), context())).status).toBe(
      400,
    );
    expect(
      (
        await theme(
          new Request("http://localhost/api/profile", {
            method: "PATCH",
            headers: { origin: "http://localhost:3000" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    vi.mocked(setServicePaused).mockRejectedValue(new ApiError(409, "Refresh the registration."));
    expect((await pause(request({ registrationId, paused: true }), context())).status).toBe(409);
  });
  it("requires authentication and rejects cross-origin mutations before loading an account", async () => {
    for (const action of [
      (r: Request) => theme(r),
      (r: Request) => pause(r, context()),
      (r: Request) => revoke(r, context()),
    ]) {
      expect((await action(request({}, "PATCH", "https://other.example"))).status).toBe(403);
    }
    expect(requireAccount).not.toHaveBeenCalled();
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in."));
    expect((await profile(new Request("http://localhost/api/profile"))).status).toBe(401);
    expect((await theme(request({ theme: "light" }))).status).toBe(401);
    expect((await pause(request({ registrationId, paused: true }), context())).status).toBe(401);
    expect(
      (
        await revoke(
          request({ registrationId, confirmPermanentDeletion: true }, "DELETE"),
          context(),
        )
      ).status,
    ).toBe(401);
  });
});

describe.each([
  ["LeetCode", leetcode, registerUsername],
  ["GFG", gfg, registerGfg],
  ["HackerRank", hackerrank, registerHackerRank],
] as const)("%s registration agreement", (_label, register, save) => {
  it.each([
    { username: "own" },
    { username: "own", acceptedAgreement: false, agreementVersion: "1" },
    { username: "own", acceptedAgreement: true, agreementVersion: "old" },
  ])("requires current explicit acceptance (%j)", async (body) => {
    expect((await register(request(body, "POST"))).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("passes the username only after agreement validation", async () => {
    expect(
      (
        await register(
          request({ username: "own", acceptedAgreement: true, agreementVersion: "1" }, "POST"),
        )
      ).status,
    ).toBe(201);
    expect(save).toHaveBeenCalledExactlyOnceWith(account, "own");
  });
});
