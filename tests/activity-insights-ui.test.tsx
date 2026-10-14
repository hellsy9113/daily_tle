// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityInsights } from "@/components/activity-insights";
import { compareWeeks } from "@/lib/activity/weekly";
import type { ActivityDay, ActivityDayDetails } from "@/lib/activity/types";

const days: ActivityDay[] = [
  { date: "2026-10-12", count: 1, coverage: "complete" },
  { date: "2026-10-13", count: 2, coverage: "partial" },
  { date: "2026-10-14", count: 0, coverage: "unknown" },
];
const weekly = compareWeeks(
  [
    { id: "same", date: "2026-10-12" },
    { id: "same", date: "2026-10-13" },
    { id: "new", date: "2026-10-13" },
  ],
  days,
  new Date("2026-10-14T03:00:00Z"),
);
const details: ActivityDayDetails = {
  date: "2026-10-13",
  basis: "accepted",
  problems: [
    { id: "two-sum", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/" },
    {
      id: "reverse-list",
      title: "Reverse List",
      url: "https://leetcode.com/problems/reverse-list/",
    },
  ],
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(fetch).mockImplementation(async (path) =>
    Response.json(String(path).includes("/goal") ? { weeklyTarget: 5 } : details),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});
const render = () =>
  act(() =>
    root.render(
      <ActivityInsights
        platform="leetcode"
        days={days}
        weekly={weekly}
        version="2026-10-14T03:00:00Z"
      />,
    ),
  );
async function select(date: string) {
  await act(() =>
    container.querySelector<HTMLButtonElement>(`button[aria-label^="${date}"]`)!.click(),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((element) =>
    element.textContent?.includes(text),
  )!;
  expect(button).toBeDefined();
  await act(() => button.click());
}
async function enterTarget(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(() =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

describe("calendar details, weekly comparisons, and goals", () => {
  it("loads saved links only after selecting a day, with keyboard access and a linked details region", async () => {
    await render();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Select a calendar day");
    await select("13 October 2026");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/activity/day?platform=leetcode&date=2026-10-13",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="https://leetcode.com/problems/two-sum/"]',
    )!;
    expect(link.textContent).toContain("Two Sum");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    const selected = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="13 October"]',
    )!;
    expect(document.getElementById(selected.getAttribute("aria-controls")!)).not.toBeNull();
    await act(() => {
      selected.focus();
      selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(document.activeElement?.getAttribute("aria-label")).toContain("12 October");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/activity/day?platform=leetcode&date=2026-10-12",
      expect.anything(),
    );
  });
  it("cancels an older day request and never replaces the new selection with its result", async () => {
    await render();
    let finish!: (response: Response) => void;
    let oldSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (path, options) => {
      if (String(path).includes("2026-10-12")) {
        oldSignal = options?.signal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return Response.json(details);
    });
    await select("12 October 2026");
    await select("13 October 2026");
    expect(oldSignal?.aborted).toBe(true);
    await act(() =>
      finish(
        Response.json({
          ...details,
          problems: [
            { id: "stale", title: "Stale problem", url: "https://leetcode.com/problems/stale/" },
          ],
        }),
      ),
    );
    expect(container.textContent).toContain("Two Sum");
    expect(container.textContent).not.toContain("Stale problem");
  });
  it("offers a safe retry for day failures without hiding the calendar", async () => {
    await render();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private transport details"));
    await select("13 October 2026");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.textContent).not.toContain("private transport details");
    expect(container.querySelector('[aria-label="Accepted problems by day"]')).not.toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(details));
    await click("Retry");
    expect(container.textContent).toContain("Two Sum");
  });
  it("compares matching weekdays and retains incomplete-history warnings", async () => {
    await render();
    expect(
      [...container.querySelectorAll(".weekly-stats dd")].map((element) => element.textContent),
    ).toEqual(["≥ 2", "≥ 0", "≥ 0"]);
    expect(container.textContent).toContain("Same days last week");
    expect(container.textContent).toContain(
      "A reliable increase or decrease cannot yet be determined",
    );
    expect(container.textContent).toContain("Each problem counts once per week");
  });
  it("shows a weekly change only when both matching periods have complete coverage", async () => {
    const covered = {
      ...weekly,
      current: { ...weekly.current, complete: true },
      previousToDate: { ...weekly.previousToDate, complete: true },
    };
    await act(() =>
      root.render(
        <ActivityInsights platform="leetcode" days={days} weekly={covered} version="checked" />,
      ),
    );
    expect(container.textContent).toContain(
      "2 more unique problems than on the same days last week",
    );
    expect(container.textContent).not.toContain(
      "A reliable increase or decrease cannot yet be determined",
    );
  });
  it("saves validated account targets, updates progress, and supports removing a target", async () => {
    await render();
    await enterTarget("1.5");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      true,
    );
    await enterTarget("2");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ weeklyTarget: 2 }));
    await submit();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/goal",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ platform: "leetcode", weeklyTarget: 2 }),
      }),
    );
    expect(container.textContent).toContain("Target reached!");
    expect(container.querySelector<HTMLProgressElement>("progress")!.value).toBe(2);
    expect(container.textContent).toContain("saved for your account");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ weeklyTarget: null }));
    await click("Remove target");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/goal",
      expect.objectContaining({
        body: JSON.stringify({ platform: "leetcode", weeklyTarget: null }),
      }),
    );
    expect(container.querySelector("progress")).toBeNull();
    expect(container.textContent).toContain("Weekly target removed");
  });
  it("keeps the saved goal and typed target when saving fails", async () => {
    await render();
    await enterTarget("10");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Could not save. Try again." }, { status: 503 }),
    );
    await submit();
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("10");
    expect(container.querySelector<HTMLProgressElement>("progress")!.max).toBe(5);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not save");
  });
  it("cancels a pending goal save when leaving the dashboard", async () => {
    await render();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await enterTarget("10");
    await submit();
    const signal = vi.mocked(fetch).mock.calls.at(-1)![1]?.signal;
    await act(() => root.render(null));
    expect(signal?.aborted).toBe(true);
    await act(() => finish(Response.json({ weeklyTarget: 10 })));
    expect(container.textContent).toBe("");
  });
  it("recovers from a failed goal load without losing the calendar", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.disabled).toBe(true);
    await click("Retry target");
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')!.disabled).toBe(false);
    expect(container.querySelector("progress")).not.toBeNull();
  });
  it("labels GFG observations and empty dates without inventing solve counts", async () => {
    vi.mocked(fetch).mockImplementation(async (path) =>
      Response.json(
        String(path).includes("/goal")
          ? { weeklyTarget: 5 }
          : { date: "2026-10-14", basis: "observed", problems: [] },
      ),
    );
    await act(() =>
      root.render(
        <ActivityInsights
          platform="gfg"
          days={days}
          weekly={weekly}
          mode="observed"
          version="checked"
        />,
      ),
    );
    expect(container.textContent).toContain("Weekly observation target");
    expect(container.textContent).toContain("2 / 5 newly observed problems");
    await select("14 October 2026");
    expect(container.textContent).toContain("This does not establish a zero-solve day");
    expect(container.textContent).toContain("The initial import is excluded");
  });
});
