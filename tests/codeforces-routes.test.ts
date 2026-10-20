import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccount } from "@/lib/auth/session";
import { getCodeforcesProgress } from "@/lib/codeforces/service";
import { ApiError } from "@/lib/http/api-error";
import { GET } from "@/app/api/codeforces/[username]/route";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/codeforces/service", () => ({ getCodeforcesProgress: vi.fn() }));

const account = { id: "own-account", codeforcesUsername: "Tourist" } as Account;
const context = (username = "tourist") => ({ params: Promise.resolve({ username }) });
const request = () => new Request("http://localhost/api/codeforces/tourist?accountId=other");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAccount).mockResolvedValue(account);
});

describe("private Codeforces progress", () => {
  it("requires sign-in before parsing a handle or reading progress", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    const response = await GET(request(), context("invalid handle"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getCodeforcesProgress).not.toHaveBeenCalled();
  });

  it.each([null, "another_handle"])(
    "rejects an unregistered or different handle (%s)",
    async (handle) => {
      vi.mocked(requireAccount).mockResolvedValue({ ...account, codeforcesUsername: handle });
      expect((await GET(request(), context())).status).toBe(403);
      expect(getCodeforcesProgress).not.toHaveBeenCalled();
    },
  );

  it.each(["invalid handle", "../tourist", "tourist?accountId=other"])(
    "validates the handle before reading saved data (%s)",
    async (handle) => {
      expect((await GET(request(), context(handle))).status).toBe(400);
      expect(getCodeforcesProgress).not.toHaveBeenCalled();
    },
  );

  it("uses only the session account and accepts case-insensitive matching", async () => {
    const progress = { username: "Tourist", savedSolved: 2 } as Awaited<
      ReturnType<typeof getCodeforcesProgress>
    >;
    vi.mocked(getCodeforcesProgress).mockResolvedValue(progress);
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(progress);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getCodeforcesProgress).toHaveBeenCalledExactlyOnceWith(account);
  });

  it("preserves a safe upstream error and hides unexpected details", async () => {
    vi.mocked(getCodeforcesProgress).mockRejectedValue(
      new ApiError(429, "Codeforces is busy. Try again shortly."),
    );
    const busy = await GET(request(), context());
    expect(busy.status).toBe(429);
    expect(busy.headers.get("cache-control")).toBe("no-store");
    vi.mocked(getCodeforcesProgress).mockRejectedValue(new Error("private database details"));
    const failed = await GET(request(), context());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "An unexpected error occurred." });
  });
});
