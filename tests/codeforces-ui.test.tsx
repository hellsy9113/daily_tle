// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeaturePage from "@/app/feature/page";
import DashboardPage from "@/app/dashboard/page";
import { CodeforcesActivityPanel } from "@/components/codeforces-activity-panel";
import { TrackingPanel } from "@/components/tracking-panel";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatuses } from "@/lib/tracking/registration";
import type { Account } from "@/lib/db/schema";
import type { CodeforcesProgress } from "@/lib/codeforces/types";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ serverAccount: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatuses: vi.fn() }));
vi.mock("@/lib/tracking/config", () => ({
  registrationAvailable: () => true,
  trackingBot: () => ({ username: "test_bot" }),
}));
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ replace: vi.fn(), refresh }),
}));

const registrationId = "10000000-0000-4000-8000-000000000001";
const progress: CodeforcesProgress = {
  platform: "codeforces",
  username: "cf_user",
  rating: 1450,
  maxRating: 1550,
  rank: "specialist",
  historyComplete: false,
  historyStart: "2026-10-12T00:00:00Z",
  checkedAt: "2026-10-14T03:00:00Z",
  timezone: "Asia/Kolkata",
  savedSolved: 2,
  solvedToday: 0,
  solvedThisWeek: 2,
  days: [
    { date: "2026-10-12", count: 1, coverage: "complete" },
    { date: "2026-10-13", count: 2, coverage: "complete" },
    { date: "2026-10-14", count: 0, coverage: "partial" },
  ],
  refreshing: false,
  refreshFailed: false,
};
const status = {
  username: "cf_user",
  connected: true,
  status: "active",
  lastDelivery: null,
  paused: false,
  registrationId,
} as const;
const account = {
  id: "own",
  leetcodeUsername: null,
  gfgUsername: null,
  hackerRankUsername: null,
  codeforcesUsername: "cf_user",
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
  vi.mocked(serverAccount).mockResolvedValue(account);
  vi.mocked(trackingStatuses).mockResolvedValue({ codeforces: status });
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});

const feature = () => FeaturePage({ searchParams: Promise.resolve({ platform: "codeforces" }) });
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === label || item.getAttribute("aria-label") === label,
  )!;

describe("Codeforces optional tracking", () => {
  it("returns sign-in to Codeforces and opens the standard registration dialog", async () => {
    vi.mocked(serverAccount).mockResolvedValueOnce(null);
    let html = renderToStaticMarkup(await feature());
    expect(html).toContain("/api/auth/telegram/login?next=codeforces");
    expect(html).not.toContain('name="username"');
    vi.mocked(serverAccount).mockResolvedValueOnce({ ...account, codeforcesUsername: null });
    vi.mocked(trackingStatuses).mockResolvedValueOnce({
      codeforces: { ...status, username: null, registrationId: null },
    });
    html = renderToStaticMarkup(await feature());
    expect(html).toContain('for="codeforces-username"');
    expect(html).toContain("Codeforces ownership is not verified");
    expect(html.match(/name="username"/g)).toHaveLength(1);
    expect(trackingStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ codeforcesUsername: null }),
      ["codeforces"],
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends registration only after explicit consent and retains Daily Grind setup", async () => {
    await act(() =>
      root.render(
        <TrackingPanel
          platform="codeforces"
          initialStatus={{ ...status, username: null, registrationId: null, connected: false }}
        />,
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input[name="username"]')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "cf_user",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => button("Continue to agreement").click());
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")!.textContent).toContain("Codeforces user agreement");
    expect(button("Accept & register").disabled).toBe(true);
    await act(() => container.querySelector<HTMLInputElement>("dialog input")!.click());
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...status, connected: false, status: "pending" }),
    );
    await act(() => button("Accept & register").click());
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/tracking/services/codeforces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "cf_user",
          agreementVersion: "1",
          acceptedAgreement: true,
        }),
      }),
    );
    expect(container.textContent).toContain("Service enabled");
    expect(container.textContent).toContain("Connect Telegram");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps Codeforces hidden until registration and replaces paused charts", async () => {
    vi.mocked(serverAccount).mockResolvedValueOnce({
      ...account,
      leetcodeUsername: "lc_user",
      codeforcesUsername: null,
    });
    vi.mocked(trackingStatuses).mockResolvedValueOnce({ leetcode: status });
    let html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain("codeforces-activity-title");
    vi.mocked(trackingStatuses).mockResolvedValueOnce({ codeforces: { ...status, paused: true } });
    html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Your daily data is still saved");
    expect(html).toContain('href="/feature?platform=codeforces"');
    expect(html).not.toContain("codeforces-activity-title");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pauses, resumes, and revokes through the same generation-bound service controls", async () => {
    await act(() => root.render(<TrackingPanel platform="codeforces" initialStatus={status} />));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...status, paused: true }));
    await act(() => button("Pause Codeforces").click());
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/services/codeforces",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ registrationId, paused: true }),
      }),
    );
    expect(container.textContent).toContain("Service paused");
    expect(container.textContent).toContain("Daily data is still saved");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(status));
    await act(() => button("Resume Codeforces").click());
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/services/codeforces",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ registrationId, paused: false }),
      }),
    );
    expect(container.textContent).toContain("Service enabled");
    await act(() => button("Revoke & delete data").click());
    expect(container.querySelector("dialog")!.textContent).toContain("Revoke Codeforces?");
    expect(button("Revoke & permanently delete").disabled).toBe(true);
    await act(() => container.querySelector<HTMLInputElement>("dialog input")!.click());
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...status, username: null, registrationId: null }),
    );
    await act(() => button("Revoke & permanently delete").click());
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/services/codeforces",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ registrationId, confirmPermanentDeletion: true }),
      }),
    );
    expect(container.textContent).toContain("Codeforces revoked");
    expect(container.querySelector("#codeforces-username")).not.toBeNull();
  });

  it("loads only the Codeforces panel for a Codeforces-only account", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(progress));
    await act(async () => root.render(await DashboardPage()));
    expect(trackingStatuses).toHaveBeenCalledExactlyOnceWith(account, ["codeforces"]);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/codeforces/cf_user"]);
    expect(container.querySelector('[aria-label="Codeforces progress by day"]')).not.toBeNull();
    expect(container.querySelector('a[href="/feature?platform=codeforces"]')).not.toBeNull();
  });

  it("shows bounded activity, ratings, and saved day links with the shared chart", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(progress));
    await act(() => root.render(<CodeforcesActivityPanel username="cf_user" />));
    expect(
      [...container.querySelectorAll(".activity-stats dd")].map((el) => el.textContent),
    ).toEqual(["2", "≥ 0", "≥ 2", "1450", "1550"]);
    const popup = container.querySelector<HTMLDivElement>('[role="tooltip"]')!;
    expect(popup.hidden).toBe(true);
    await act(() => button("Codeforces chart information").focus());
    expect(popup.hidden).toBe(false);
    expect(popup.textContent).toContain("Large histories may be partial");
    expect(popup.textContent).toContain("repeated accepts on the same day count once");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        date: "2026-10-13",
        basis: "accepted",
        problems: [
          {
            id: "1:A",
            title: "Theatre Square",
            url: "https://codeforces.com/problemset/problem/1/A",
            difficulty: "1000",
          },
        ],
      }),
    );
    await act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label^="13 October 2026"]')!.click(),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/activity/day?platform=codeforces&date=2026-10-13",
      expect.anything(),
    );
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="https://codeforces.com/problemset/problem/1/A"]',
    )!;
    expect(link.textContent).toContain("Theatre Square");
    expect(link.rel).toBe("noopener noreferrer");
    expect(container.querySelector(".day-problems")?.textContent).toContain("1000");
  });

  it("shows unrated empty profiles without fabricating a contest rating", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        ...progress,
        rating: null,
        maxRating: null,
        rank: null,
        historyComplete: true,
        savedSolved: 0,
        solvedToday: 0,
        solvedThisWeek: 0,
      }),
    );
    await act(() => root.render(<CodeforcesActivityPanel username="cf_user" />));
    expect(
      [...container.querySelectorAll(".activity-stats dd")].map((el) => el.textContent),
    ).toEqual(["0", "0", "0", "Unrated", "Unrated"]);
    expect(container.textContent).not.toContain("progress is unavailable");
  });

  it("retains the chart and counts after a failed refresh and supports retries", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(progress));
    await act(() => root.render(<CodeforcesActivityPanel username="cf_user" />));
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private transport detail"));
    await act(() => button("Refresh Codeforces").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.textContent).not.toContain("private transport detail");
    expect(container.querySelector('[aria-label="Codeforces progress by day"]')).not.toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...progress, savedSolved: 3 }));
    await act(() => button("Refresh Codeforces").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".activity-stats dd")?.textContent).toBe("3");
  });

  it("displays saved-data refresh failure separately and cancels pending requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...progress, refreshFailed: true }));
    await act(() => root.render(<CodeforcesActivityPanel username="cf_user" />));
    expect(container.textContent).toContain("Showing your saved progress");
    let signal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementationOnce(async (_, options) => {
      signal = options?.signal;
      return new Promise<Response>(() => {});
    });
    await act(() => button("Refresh Codeforces").click());
    await act(() => root.render(null));
    expect(signal?.aborted).toBe(true);
  });
});
