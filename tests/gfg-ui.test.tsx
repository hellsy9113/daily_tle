// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GfgActivityPanel } from "@/components/gfg-activity-panel";
import { ActivityChart } from "@/components/activity-chart";
import { normalizeGfgProfile } from "@/lib/gfg/transform";
import { buildGfgProgress } from "@/lib/gfg/progress";
import FeaturePage from "@/app/feature/page";
import DashboardPage from "@/app/dashboard/page";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import type { Account } from "@/lib/db/schema";
import type { TrackingStatus } from "@/lib/tracking/types";

vi.mock("@/lib/auth/session", () => ({ serverAccount: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatus: vi.fn() }));
vi.mock("@/lib/tracking/config", () => ({
  registrationAvailable: () => true,
  trackingBot: () => ({ username: "test_bot" }),
}));
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
const now = new Date("2026-10-14T03:00:00Z");
const profile = normalizeGfgProfile(
  "gfg_user",
  { data: { total_problems_solved: 1 } },
  {
    status: "success",
    count: 1,
    result: {
      Easy: { a: { slug: "two-sum", pname: "Two Sum", user_subtime: "2026-10-13 22:00:00" } },
    },
  },
  now,
);
const progress = buildGfgProgress(
  profile,
  profile.problems.map((problem) => ({
    ...problem,
    baseline: false,
    firstObservedAt: now.toISOString(),
  })),
  [],
  now,
);
const status: TrackingStatus = {
  username: "gfg_user",
  connected: true,
  status: "active",
  lastDelivery: null,
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(() => {
  vi.clearAllMocks();
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(serverAccount).mockResolvedValue(null);
  vi.mocked(trackingStatus).mockResolvedValue(status);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});

describe("GFG feature onboarding and dashboard", () => {
  it("requires sign-in on Feature and returns to that page after authentication", async () => {
    const html = renderToStaticMarkup(await FeaturePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Sign in to enable this feature");
    expect(html).toContain("/api/auth/telegram/login?next=feature");
    expect(html).not.toContain('name="username"');
  });
  it("shows the separate permanent GFG registration to a signed-in account", async () => {
    vi.mocked(serverAccount).mockResolvedValue({ id: "own", gfgUsername: null } as Account);
    vi.mocked(trackingStatus).mockResolvedValue({ ...status, username: null, connected: false });
    const html = renderToStaticMarkup(await FeaturePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('for="gfg-username"');
    expect(html).toContain("cannot be changed");
    expect(trackingStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "own" }), "gfg");
  });
  it.each(["active", "paused", "blocked"] as const)(
    "keeps Feature accessible for a registered %s account and shows login status",
    async (accountStatus) => {
      vi.mocked(serverAccount).mockResolvedValue({ id: "own", gfgUsername: "gfg_user" } as Account);
      vi.mocked(trackingStatus).mockResolvedValue({ ...status, status: accountStatus });
      const html = renderToStaticMarkup(await FeaturePage({ searchParams: Promise.resolve({}) }));
      expect(html).toContain("Logged in");
      expect(html).toContain("gfg_user");
      expect(html).not.toContain("View dashboard");
      expect(html.match(/href="\/dashboard"/g)).toHaveLength(1);
      expect(html).not.toContain("Locked");
      expect(html).not.toContain('name="username"');
    },
  );
  it("hides the GFG section on the dashboard before registration", async () => {
    vi.mocked(serverAccount).mockResolvedValue({
      id: "own",
      leetcodeUsername: "leetcode_user",
      gfgUsername: null,
      chatId: 101,
      status: "active",
    } as Account);
    vi.mocked(trackingStatus).mockResolvedValue({ ...status, username: "leetcode_user" });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain("gfg-activity-title");
    expect(html).not.toContain("Enable GFG tracking");
    expect(html).toContain('href="/feature"');
    expect(fetch).not.toHaveBeenCalled();
  });
  it("labels observations and unavailable solve counts without inventing historical totals", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(progress));
    await act(() => root.render(<GfgActivityPanel username="gfg_user" />));
    expect(container.textContent).toContain("GFG · gfg_user");
    expect(container.textContent).toContain("newly observed");
    expect(container.textContent).toContain("does not assign guessed historical solve dates");
    expect(
      [...container.querySelectorAll(".activity-stats dd")].map((element) => element.textContent),
    ).toEqual(["1", "—", "—", "1"]);
    expect(container.querySelector('[aria-label="GeeksforGeeks progress by day"]')).not.toBeNull();
  });
  it("keeps saved GFG progress visible after a failed refresh", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(progress));
    await act(() => root.render(<GfgActivityPanel username="gfg_user" />));
    vi.mocked(fetch).mockRejectedValue(new Error("private transport detail"));
    await act(() =>
      container.querySelector<HTMLButtonElement>(".activity-heading button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.textContent).not.toContain("private transport detail");
    expect(container.querySelector('[aria-label="GeeksforGeeks progress by day"]')).not.toBeNull();
  });
  it("supports a GFG-only dashboard without invoking LeetCode activity", async () => {
    vi.mocked(serverAccount).mockResolvedValue({
      id: "own",
      leetcodeUsername: null,
      gfgUsername: "gfg_user",
      chatId: 101,
      status: "active",
    } as Account);
    vi.mocked(fetch).mockImplementation(async (path) =>
      Response.json(String(path).startsWith("/api/gfg/") ? progress : status),
    );
    const page = await DashboardPage();
    await act(() => root.render(page));
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).not.toContain(
      "/api/tracking/activity",
    );
    expect(container.querySelector('[aria-label="GeeksforGeeks progress by day"]')).not.toBeNull();
  });
  it("uses distinct help IDs when two activity charts share the dashboard", () => {
    const html = renderToStaticMarkup(
      <>
        <ActivityChart days={progress.days} />
        <ActivityChart days={progress.days} mode="observed" label="GFG" />
      </>,
    );
    const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
