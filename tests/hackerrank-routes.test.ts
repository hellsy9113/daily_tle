import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccount } from "@/lib/auth/session";
import { ApiError } from "@/lib/http/api-error";
import { getHackerRankProgress, registerHackerRank } from "@/lib/hackerrank/service";
import { trackingStatus } from "@/lib/tracking/registration";
import { GET as progress } from "@/app/api/hackerrank/[username]/route";
import { GET as status, POST as register } from "@/app/api/tracking/hackerrank/route";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/hackerrank/service", () => ({
  getHackerRankProgress: vi.fn(),
  registerHackerRank: vi.fn(),
}));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatus: vi.fn() }));
const own = { id: "own", hackerRankUsername: "Hackerrank_User" } as Account;
const context = (username = "hackerrank_user") => ({ params: Promise.resolve({ username }) });
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/tracking/hackerrank", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.mocked(requireAccount).mockResolvedValue(own);
  vi.mocked(trackingStatus).mockResolvedValue({
    username: "Hackerrank_User",
    connected: true,
    status: "active",
    lastDelivery: null,
  });
  vi.mocked(registerHackerRank).mockResolvedValue({
    username: "Hackerrank_User",
    connected: true,
    status: "active",
    lastDelivery: null,
  });
});
describe("HackerRank feature authorization and routes", () => {
  it("returns only the signed-in account's HackerRank status", async () => {
    const response = await status(
      new Request("http://localhost/api/tracking/hackerrank?accountId=other"),
    );
    expect(response.status).toBe(200);
    expect(trackingStatus).toHaveBeenCalledExactlyOnceWith(own, "hackerrank");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires sign-in before the service is available", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect(
      (await progress(new Request("http://localhost/api/hackerrank/hackerrank_user"), context()))
        .status,
    ).toBe(401);
    expect(getHackerRankProgress).not.toHaveBeenCalled();
  });
  it.each([null, "another_user"])(
    "requires the registered username and opt-in (%s)",
    async (username) => {
      vi.mocked(requireAccount).mockResolvedValue({ ...own, hackerRankUsername: username });
      expect(
        (await progress(new Request("http://localhost/api/hackerrank/hackerrank_user"), context()))
          .status,
      ).toBe(403);
      expect(getHackerRankProgress).not.toHaveBeenCalled();
    },
  );
  it("returns private progress only for the registered account", async () => {
    vi.mocked(getHackerRankProgress).mockResolvedValue({
      username: "Hackerrank_User",
      savedSolved: 2,
    } as Awaited<ReturnType<typeof getHackerRankProgress>>);
    const response = await progress(
      new Request("http://localhost/api/hackerrank/hackerrank_user?accountId=other"),
      context(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getHackerRankProgress).toHaveBeenCalledExactlyOnceWith(own);
  });
  it("registers a separate HackerRank username without accepting account IDs or cross-origin mutations", async () => {
    expect(
      (await register(request({ username: "Hackerrank_User" }, "https://attacker.example"))).status,
    ).toBe(403);
    expect(
      (await register(request({ username: "Hackerrank_User", accountId: "other" }))).status,
    ).toBe(400);
    expect(registerHackerRank).not.toHaveBeenCalled();
    expect((await register(request({ username: "Hackerrank_User" }))).status).toBe(201);
    expect(registerHackerRank).toHaveBeenCalledExactlyOnceWith(own, "Hackerrank_User");
  });
});
