// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityInsights } from "@/components/activity-insights";
import type { ActivityDay, ActivityDayDetails } from "@/lib/activity/types";

const days: ActivityDay[] = [
  { date: "2026-10-12", count: 1, coverage: "complete" },
  { date: "2026-10-13", count: 2, coverage: "partial" },
  { date: "2026-10-14", count: 0, coverage: "unknown" },
];
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
  vi.mocked(fetch).mockImplementation(async () => Response.json(details));
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});
const render = () =>
  act(() =>
    root.render(
      <ActivityInsights platform="leetcode" days={days} version="2026-10-14T03:00:00Z" />,
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

describe("calendar day details", () => {
  it("loads saved links only after selecting a day, with keyboard access and a linked details region", async () => {
    await render();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Weekly practice");
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Select a calendar day");
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
  it("labels GFG observations and empty dates without inventing solve counts", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ date: "2026-10-14", basis: "observed", problems: [] }),
    );
    await act(() =>
      root.render(
        <ActivityInsights platform="gfg" days={days} mode="observed" version="checked" />,
      ),
    );
    expect(container.textContent).not.toContain("Weekly observations");
    expect(container.querySelector("form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await select("14 October 2026");
    expect(container.textContent).toContain("This does not establish a zero-solve day");
    expect(container.textContent).not.toContain("The initial import is excluded");
  });
});
