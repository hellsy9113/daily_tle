import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccount } from "@/lib/auth/session";
import { getAccountActivity } from "@/lib/activity/service";
import { GET } from "@/app/api/tracking/activity/route";
import { ApiError } from "@/lib/http/api-error";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/activity/service", () => ({ getAccountActivity: vi.fn() }));
const ownAccount = { id: "own", leetcodeUsername: "fixed-user" } as Account;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAccount).mockResolvedValue(ownAccount);
});
describe("authenticated activity endpoint", () => {
  it("ignores supplied usernames and account identifiers and prevents caching", async () => {
    vi.mocked(getAccountActivity).mockResolvedValue({ username: "fixed-user" } as Awaited<
      ReturnType<typeof getAccountActivity>
    >);
    const response = await GET(
      new Request("https://site.test/api/tracking/activity?username=other&accountId=other"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: "fixed-user" });
    expect(getAccountActivity).toHaveBeenCalledExactlyOnceWith(ownAccount);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("never reads activity without a session", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect((await GET(new Request("https://site.test/api/tracking/activity"))).status).toBe(401);
    expect(getAccountActivity).not.toHaveBeenCalled();
  });
  it.each([409, 404, 502, 503, 504])("preserves safe service errors (%s)", async (status) => {
    vi.mocked(getAccountActivity).mockRejectedValue(new ApiError(status, "Activity unavailable."));
    const response = await GET(new Request("https://site.test/api/tracking/activity"));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Activity unavailable." });
  });
});
