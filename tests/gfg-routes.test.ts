import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccount } from "@/lib/auth/session";
import { ApiError } from "@/lib/http/api-error";
import { getGfgProgress, registerGfg } from "@/lib/gfg/service";
import { trackingStatus } from "@/lib/tracking/registration";
import { GET as progress } from "@/app/api/gfg/[username]/route";
import { GET as status, POST as register } from "@/app/api/tracking/gfg/route";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/gfg/service", () => ({ getGfgProgress: vi.fn(), registerGfg: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatus: vi.fn() }));
const own = { id: "own", gfgUsername: "Gfg_User" } as Account;
const context = (username = "gfg_user") => ({ params: Promise.resolve({ username }) });
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/tracking/gfg", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.mocked(requireAccount).mockResolvedValue(own);
  vi.mocked(trackingStatus).mockResolvedValue({
    username: "Gfg_User",
    connected: true,
    status: "active",
    lastDelivery: null,
  });
  vi.mocked(registerGfg).mockResolvedValue({
    username: "Gfg_User",
    connected: true,
    status: "active",
    lastDelivery: null,
  });
});
describe("GFG feature authorization and routes", () => {
  it("returns only the signed-in account's GFG status", async () => {
    const response = await status(new Request("http://localhost/api/tracking/gfg?accountId=other"));
    expect(response.status).toBe(200);
    expect(trackingStatus).toHaveBeenCalledExactlyOnceWith(own, "gfg");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires sign-in before the service is available", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect(
      (await progress(new Request("http://localhost/api/gfg/gfg_user"), context())).status,
    ).toBe(401);
    expect(getGfgProgress).not.toHaveBeenCalled();
  });
  it.each([null, "another_user"])(
    "requires the registered username and opt-in (%s)",
    async (username) => {
      vi.mocked(requireAccount).mockResolvedValue({ ...own, gfgUsername: username });
      expect(
        (await progress(new Request("http://localhost/api/gfg/gfg_user"), context())).status,
      ).toBe(403);
      expect(getGfgProgress).not.toHaveBeenCalled();
    },
  );
  it("validates query parameters before synchronization", async () => {
    expect(
      (await progress(new Request("http://localhost/api/gfg/gfg_user?period=bad"), context()))
        .status,
    ).toBe(400);
    expect(getGfgProgress).not.toHaveBeenCalled();
  });
  it("passes only the own account and supported query to the progress service", async () => {
    vi.mocked(getGfgProgress).mockResolvedValue({ username: "Gfg_User", totalSolved: 2 } as Awaited<
      ReturnType<typeof getGfgProgress>
    >);
    const response = await progress(
      new Request("http://localhost/api/gfg/gfg_user?includeProblems=true"),
      context(),
    );
    expect(response.status).toBe(200);
    expect(getGfgProgress).toHaveBeenCalledWith(
      own,
      expect.objectContaining({ includeProblems: true, period: "all" }),
    );
  });
  it("registers a separate GFG username without accepting account IDs or cross-origin mutations", async () => {
    expect(
      (await register(request({ username: "Gfg_User" }, "https://attacker.example"))).status,
    ).toBe(403);
    expect((await register(request({ username: "Gfg_User", accountId: "other" }))).status).toBe(
      400,
    );
    expect(registerGfg).not.toHaveBeenCalled();
    expect((await register(request({ username: "Gfg_User" }))).status).toBe(201);
    expect(registerGfg).toHaveBeenCalledExactlyOnceWith(own, "Gfg_User");
  });
});
