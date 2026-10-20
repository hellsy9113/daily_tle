// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeetCodeDemo } from "@/components/leetcode-demo";
import type { RecentSolvedQuestions } from "@/lib/leetcode/types";

const result: RecentSolvedQuestions = {
  username: "example",
  count: 1,
  sourceLimit: 20,
  checkedAt: "2026-10-18T03:00:00Z",
  questions: [{ title: "Two Sum", titleSlug: "two-sum", timestamp: "1792202400" }],
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<LeetCodeDemo botUrl="https://t.me/todo1245bot" />));
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});
async function openDemo() {
  await act(() =>
    container
      .querySelector<HTMLButtonElement>('button[type="button"][aria-haspopup="dialog"]')!
      .click(),
  );
}
async function submit(username: string) {
  const close = container.querySelector<HTMLButtonElement>(
    '[aria-label="Close recent solved questions"]',
  );
  if (close) await act(() => close.click());
  await act(() => {
    const input = container.querySelector<HTMLInputElement>("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      username,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
describe("homepage live LeetCode demo", () => {
  it("keeps the username form and original query-bot button on the homepage", () => {
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('label[for="demo-username"]')).not.toBeNull();
    expect(container.querySelector("form input")).not.toBeNull();
    const link = container.querySelector<HTMLAnchorElement>(
      'a.demo-bot-link[href="https://t.me/todo1245bot"]',
    )!;
    expect(link.textContent).toContain("Open query bot");
    expect(link.rel).toBe("noopener noreferrer");
    expect(container.textContent).toContain("No sign-in needed");
  });
  it("fetches the public API and displays Accepted problems as linked grid cards", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));
    await submit(" example ");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/user/recent-solved/example",
      expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }),
    );
    const card = container.querySelector<HTMLAnchorElement>(
      '.demo-problem-grid a[href="https://leetcode.com/problems/two-sum/"]',
    )!;
    expect(card.textContent).toContain("Two Sum");
    expect(card.textContent).toContain("Accepted");
    expect(card.textContent).toContain("IST");
    expect(card.rel).toBe("noopener noreferrer");
    expect(document.activeElement).toBe(container.querySelector(".demo-results-scroll"));
    expect(container.querySelector("dialog h2")).toBeNull();
  });
  it("rejects invalid input without making a request", async () => {
    await submit("two words");
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("without spaces");
  });
  it("shows loading feedback and cancels a pending request on unmount", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    await submit("example");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      true,
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Fetching public");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(() => root.render(null));
    expect(signal?.aborted).toBe(true);
  });
  it("keeps entered usernames and saved results after a recoverable failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));
    await submit("example");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private upstream detail"));
    await submit("another_user");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.textContent).not.toContain("private upstream detail");
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("another_user");
    expect(container.querySelector("dialog")).toBeNull();
    await openDemo();
    expect(container.querySelector("dialog")?.getAttribute("aria-label")).toContain("example");
    expect(container.querySelector(".demo-problem-grid h4")?.textContent).toBe("Two Sum");
  });
  it("distinguishes an empty public feed from a lifetime zero-solve count", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...result, count: 0, questions: [] }));
    await submit("example");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "does not mean the account has never solved",
    );
    expect(container.querySelector(".demo-problem-grid")).toBeNull();
  });
  it("does not replace a newer result with an older request", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ ...result, username: "new_user" }));
    await submit("old_user");
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await submit("new_user");
    await act(() => finish(Response.json({ ...result, username: "old_user" })));
    expect(oldSignal?.aborted).toBe(true);
    expect(container.querySelector("dialog")?.getAttribute("aria-label")).toContain("new_user");
  });
  it("shows results only in a scrollable dialog and restores focus after Escape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));
    await submit("example");
    const dialog = container.querySelector("dialog")!;
    expect(dialog.getAttribute("aria-label")).toBe("Recent solved questions for example");
    expect(dialog.querySelector("form")).toBeNull();
    expect(dialog.querySelector('.demo-results-scroll[tabindex="0"]')).not.toBeNull();
    expect(dialog.querySelector(".demo-problem-list")).not.toBeNull();
    await act(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector("form input")).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector('button[type="submit"]'));
    expect(document.body.style.overflow).toBe("");
  });
  it("keeps lookup results when the popup is closed and reopened", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));
    await submit("example");
    await act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close recent solved questions"]')!
        .click(),
    );
    expect(container.querySelector(".demo-problem-grid")).toBeNull();
    await openDemo();
    expect(container.querySelector(".demo-problem-grid")?.textContent).toContain("Two Sum");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
