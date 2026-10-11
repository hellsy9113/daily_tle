import { describe, expect, it, vi } from "vitest";
import { GET as getProfile } from "@/app/api/user/[username]/route";
import { GET as getSubmissions } from "@/app/api/user/weeklySolved/[username]/route";
import { GET as getUser } from "@/app/api/user/route";
import { recentSubmissions } from "./fixtures";

const request = new Request("http://localhost/api/user/example");
const context = (username: string) => ({ params: Promise.resolve({ username }) });

describe("user API routes", () => {
  it("returns the original weeklySolved response envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: recentSubmissions })));
    const response = await getSubmissions(request, context("example"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(recentSubmissions);
  });

  it("returns JSON for a missing username", async () => {
    const response = await getUser();
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  it("returns 404 JSON for a nonexistent profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: { matchedUser: null } })),
    );
    const response = await getProfile(request, context("missing"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "LeetCode user was not found." });
  });

  it("returns 400 JSON for an invalid username", async () => {
    const response = await getProfile(request, context("two words"));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a safe 502 JSON error instead of an unhandled upstream exception", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private upstream URL")));
    const response = await getSubmissions(request, context("example"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private upstream URL");
  });
});
