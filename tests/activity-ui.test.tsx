// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityChart } from "@/components/activity-chart";
import { ActivityDashboard } from "@/components/activity-dashboard";
import type { ActivityResult } from "@/lib/activity/types";
import type { TrackingStatus } from "@/lib/tracking/types";

const days: ActivityResult["days"] = [
  { date: "2026-10-11", count: 0, coverage: "unknown" },
  { date: "2026-10-12", count: 1, coverage: "partial" },
  { date: "2026-10-13", count: 8, coverage: "complete" },
  { date: "2026-10-14", count: 0, coverage: "complete" },
];
const activity: ActivityResult = {
  username: "fixed-user",
  timezone: "Asia/Kolkata",
  start: "2025-10-15",
  end: "2026-10-15",
  days,
  uniqueQuestions: 9,
  activeDays: 2,
  currentStreak: 2,
  currentStreakMayBeLonger: true,
  longestStreak: 2,
  longestStreakMayBeLonger: true,
  mayBeIncomplete: true,
  lastSyncedAt: "2026-10-14T03:00:00Z",
  refreshing: false,
  refreshFailed: false,
};
const status: TrackingStatus = {
  username: "fixed-user",
  connected: true,
  status: "active",
  lastDelivery: null,
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});
const renderDashboard = async () =>
  act(() =>
    root.render(<ActivityDashboard initialStatus={status} botUrl="https://t.me/test_bot" />),
  );
function responses(result = activity, state = status) {
  vi.mocked(fetch).mockImplementation(async (path) =>
    Response.json(String(path).endsWith("/activity") ? result : state),
  );
}
describe("Accepted calendar accessibility and interaction", () => {
  it("distinguishes unavailable history from zero and uses increasing green levels", () => {
    const html = renderToStaticMarkup(<ActivityChart days={days} />);
    expect(html).toContain("history unavailable");
    expect(html).toContain("history incomplete");
    expect(html).toContain("activity-level-1");
    expect(html).toContain("activity-level-4");
    expect(html).toContain("0 unique Accepted problems");
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(1);
  });
  it("provides a single tab stop and arrow, Home, and End keyboard navigation with spoken counts", async () => {
    await act(() => root.render(<ActivityChart days={days} />));
    const last = container.querySelector<HTMLButtonElement>('button[tabindex="0"]')!;
    await act(() => {
      last.focus();
      last.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(document.activeElement?.getAttribute("aria-label")).toContain(
      "13 October 2026: 8 unique Accepted problems",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain("8 unique");
    await act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      ),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toContain("history unavailable");
    await act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(last);
    expect(container.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
  });
});
describe("activity dashboard", () => {
  it("starts with an intentional loading state", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    await renderDashboard();
    expect(container.textContent).toContain("Loading your Accepted activity");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
  it("shows bot status before the calendar, fixed username, counts, timezone, and limited-history guidance", async () => {
    responses();
    await renderDashboard();
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("fixed-user");
    expect(container.textContent).toContain("Last 365 days · Asia/Kolkata");
    expect(container.textContent).toContain("≥ 9");
    expect(container.textContent).toContain("minimum we can confirm");
    expect(container.textContent).not.toMatch(/postgres|lease|database/i);
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe(
      "Telegram bot status",
    );
    expect(container.querySelector('[aria-labelledby="activity-title"]')).not.toBeNull();
    expect(container.querySelector("#activity-title")?.textContent).toBe(
      "Your practice, day by day.",
    );
  });
  it("shows session-expiry feedback even for a non-JSON authentication error", async () => {
    responses();
    await renderDashboard();
    vi.mocked(fetch).mockImplementation(async () => new Response("Sign in", { status: 401 }));
    await act(() =>
      container.querySelector<HTMLButtonElement>(".dashboard-actions button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Your session expired",
    );
    expect(container.textContent).toContain("≥ 9");
  });
  it("preserves saved counts when refresh fails, shows retry feedback, and recovers", async () => {
    responses();
    await renderDashboard();
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    await act(() =>
      container.querySelector<HTMLButtonElement>(".dashboard-actions button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not refresh");
    expect(container.textContent).toContain("≥ 9");
    responses({ ...activity, refreshFailed: true });
    await act(() =>
      container.querySelector<HTMLButtonElement>(".dashboard-actions button")!.click(),
    );
    expect(container.textContent).toContain("Showing your saved activity");
  });
  it.each(["paused", "blocked"] as const)(
    "keeps the chart usable when the bot is %s",
    async (state) => {
      responses(activity, { ...status, status: state });
      await renderDashboard();
      expect(container.textContent).toContain(state === "paused" ? "Paused" : "Blocked");
      expect(container.textContent).toContain("/start");
      expect(container.querySelector('[aria-label="Accepted problems by day"]')).not.toBeNull();
    },
  );
  it("waits for a concurrent first sync and then shows its result", async () => {
    vi.useFakeTimers();
    responses({ ...activity, days: [], refreshing: true, lastSyncedAt: null });
    await renderDashboard();
    expect(container.textContent).toContain("Syncing recent Accepted activity");
    responses();
    await act(() => vi.advanceTimersByTime(2000));
    expect(
      container.querySelector('button[aria-label*="8 unique Accepted problems"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Syncing recent Accepted activity");
  });
});
