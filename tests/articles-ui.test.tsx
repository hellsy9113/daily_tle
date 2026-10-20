// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticlesPanel } from "@/components/articles-panel";
import { ArticlesSetup } from "@/components/articles-setup";
import type { DailyArticleFeed } from "@/lib/articles/topics";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const feed: DailyArticleFeed = {
  date: "2026-10-20",
  timezone: "Asia/Kolkata",
  topics: ["web"],
  selectedTopics: ["web"],
  generatedAt: "2026-10-20T00:00:00Z",
  articles: [
    {
      id: "one",
      title: "A web tutorial",
      source: "Publisher",
      publishedAt: "2026-10-19T00:00:00Z",
      topic: "web",
      summary: "A short publisher excerpt",
      url: "https://example.com/tutorial",
    },
  ],
};
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
});
async function retry() {
  await act(() =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Retry / refresh")!
      .click(),
  );
}
describe("Daily Articles interface", () => {
  it("shows loading then publisher metadata and safe original links", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(() => root.render(<ArticlesPanel />));
    expect(container.textContent).toContain("Loading today's reading");
    await act(() => resolve(Response.json(feed)));
    expect(container.textContent).toContain("Publisher");
    expect(container.textContent).toContain("19 Oct 2026");
    expect(container.textContent).toContain("Web development");
    expect(container.textContent).toContain("A short publisher excerpt");
    const link = container.querySelector('a[href="https://example.com/tutorial"]')!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/articles", expect.any(Object));
  });
  it("supports empty state and retry after an initial error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );
    await act(() => root.render(<ArticlesPanel />));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Please retry");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...feed, articles: [] }));
    await retry();
    expect(container.textContent).toContain("No unseen matches today");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("retains saved cards after transient failure but hides them when access is revoked", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(feed));
    await act(() => root.render(<ArticlesPanel />));
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await retry();
    expect(container.textContent).toContain("A web tutorial");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Register again" }, { status: 409 }),
    );
    await retry();
    expect(container.textContent).toContain("Access unavailable");
    expect(container.textContent).not.toContain("A web tutorial");
  });
  it("requires at least one topic, disables a third, and posts selected preferences", async () => {
    await act(() =>
      root.render(
        <ArticlesSetup
          initialStatus={{
            username: null,
            registrationId: null,
            paused: false,
            connected: false,
            status: "pending",
            lastDelivery: null,
          }}
        />,
      ),
    );
    const submit = () =>
      container.querySelector<HTMLButtonElement>('button[type="submit"], form button')!;
    expect(submit().disabled).toBe(true);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(() => inputs[0].click());
    await act(() => inputs[1].click());
    expect(inputs[2].disabled).toBe(true);
    expect(inputs[0].disabled).toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        username: "Daily reading",
        registrationId: "abc",
        topics: ["dsa", "ai-ml"],
        paused: false,
        connected: false,
        status: "pending",
        lastDelivery: null,
      }),
    );
    await act(() =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/services/articles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ topics: ["dsa", "ai-ml"] }),
      }),
    );
    expect(container.textContent).toContain("Manage Daily Articles");
    expect(container.textContent).toContain("Topics saved");
  });
});
