// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeaturePage from "@/app/feature/page";
import DashboardPage from "@/app/dashboard/page";
import { HackerRankActivityPanel } from "@/components/hackerrank-activity-panel";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import { buildHackerRankProgress } from "@/lib/hackerrank/progress";
import type { Account } from "@/lib/db/schema";
import { hackerRankNow, hackerRankProfile, storedHackerRank } from "./hackerrank-fixtures";

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
const profile = hackerRankProfile();
const progress = buildHackerRankProgress(profile, storedHackerRank(profile), [], hackerRankNow);
const status = {
  username: "hr_user",
  connected: true,
  status: "active",
  lastDelivery: null,
} as const;
const account = {
  id: "own",
  leetcodeUsername: null,
  gfgUsername: null,
  hackerRankUsername: "hr_user",
  chatId: 101,
} as Account;
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
const feature = () => FeaturePage({ searchParams: Promise.resolve({ platform: "hackerrank" }) });

describe("HackerRank optional tracking", () => {
  it("provides separate feature choices and returns sign-in to HackerRank", async () => {
    const html = renderToStaticMarkup(await feature());
    expect(html).toContain('href="/feature"');
    expect(
      new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector('a[href="/feature?platform=hackerrank"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(html).toContain("/api/auth/telegram/login?next=hackerrank");
    expect(html).toContain("Sign in to enable this feature");
    expect(html).not.toContain('name="username"');
  });
  it("registers independently and stays accessible after registration", async () => {
    vi.mocked(serverAccount).mockResolvedValue(account);
    vi.mocked(trackingStatus).mockResolvedValueOnce({ ...status, username: null });
    let html = renderToStaticMarkup(await feature());
    expect(html).toContain('for="hackerrank-username"');
    expect(html).toContain("cannot be changed");
    expect(trackingStatus).toHaveBeenCalledWith(account, "hackerrank");
    html = renderToStaticMarkup(await feature());
    expect(html).toContain("Logged in");
    expect(html).not.toContain('name="username"');
    expect(html).not.toContain("View dashboard");
    expect(html.match(/href="\/dashboard"/g)).toHaveLength(1);
  });
  it("keeps the dashboard section hidden until HackerRank registration", async () => {
    vi.mocked(serverAccount).mockResolvedValue({
      ...account,
      leetcodeUsername: "lc_user",
      hackerRankUsername: null,
    });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain("hackerrank-activity-title");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("directs an unconnected HackerRank-only account to its own setup", async () => {
    vi.mocked(serverAccount).mockResolvedValue({ ...account, chatId: null });
    await expect(DashboardPage()).rejects.toThrow("redirect:/feature?platform=hackerrank");
  });
  it("supports a HackerRank-only dashboard without fetching other platforms", async () => {
    vi.mocked(serverAccount).mockResolvedValue(account);
    vi.mocked(fetch).mockImplementation(async (path) =>
      Response.json(String(path).startsWith("/api/hackerrank/") ? progress : status),
    );
    await act(async () => root.render(await DashboardPage()));
    expect(trackingStatus).toHaveBeenCalledExactlyOnceWith(account, "hackerrank");
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "/api/hackerrank/hr_user",
      "/api/tracking/hackerrank",
    ]);
    expect(container.querySelector('[aria-label="HackerRank progress by day"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Weekly practice|Weekly observations/);
    expect(container.querySelector(".activity-panel form")).toBeNull();
  });
  it("shows saved counts and day links with explicit history limits", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(progress));
    await act(() => root.render(<HackerRankActivityPanel username="hr_user" />));
    expect(container.textContent).toContain("Saved unique problems");
    expect(container.textContent).toContain("first-ever solve dates are not guaranteed");
    expect(
      [...container.querySelectorAll(".activity-stats dd")].map((el) => el.textContent),
    ).toEqual(["1", "≥ 0", "≥ 1"]);
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ date: "2026-10-13", basis: "solved", problems: profile.problems }),
    );
    await act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label^="13 October 2026"]')!.click(),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/activity/day?platform=hackerrank&date=2026-10-13",
      expect.anything(),
    );
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="https://www.hackerrank.com/challenges/two-sum"]',
    )!;
    expect(link.textContent).toContain("two-sum");
    expect(link.rel).toBe("noopener noreferrer");
    expect(container.textContent).toContain("Saved HackerRank solved activity");
  });
  it("retains saved progress and safe feedback after a refresh fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(progress));
    await act(() => root.render(<HackerRankActivityPanel username="hr_user" />));
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private transport detail"));
    await act(() =>
      container.querySelector<HTMLButtonElement>(".activity-heading button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.textContent).not.toContain("private transport detail");
    expect(container.querySelector('[aria-label="HackerRank progress by day"]')).not.toBeNull();
  });
  it("cancels pending progress requests when leaving the dashboard", async () => {
    let signal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (_, options) => {
      signal = options?.signal;
      return new Promise<Response>(() => {});
    });
    await act(() => root.render(<HackerRankActivityPanel username="hr_user" />));
    await act(() => root.render(null));
    expect(signal?.aborted).toBe(true);
  });
});
