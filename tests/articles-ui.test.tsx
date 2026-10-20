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
  registrationId: "aabbccdd-1111-2222-3333-aabbccddeeff",
  nextRefreshAt: "1970-01-01T00:00:00.000Z",
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
    (container.querySelector<HTMLButtonElement>(".inline-error + button") ??
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Retry reading list",
      ) ??
      container.querySelector<HTMLButtonElement>('[aria-label="Refresh articles"]'))!.click(),
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
  it("posts a manual refresh, displays filled slots and reports catalog additions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(feed));
    await act(() => root.render(<ArticlesPanel />));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          sources: 2,
          inserted: 4,
          failed: 0,
          deferred: 0,
          skipped: 0,
          nextRefreshAt: "2026-10-20T01:15:00Z",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...feed,
          articles: [
            ...feed.articles,
            { ...feed.articles[0], id: "new", title: "A freshly fetched article" },
          ],
        }),
      );
    await retry();
    expect(container.textContent).toContain("A freshly fetched article");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/articles/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registrationId: feed.registrationId }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/articles", expect.any(Object));
    expect(container.textContent).toContain("4 new articles saved");
    expect(container.textContent).toContain("A web tutorial");
    expect(container.textContent).toContain("up to six articles");
  });
  it("retains the list and explains cooldowns without another upstream attempt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(feed));
    await act(() => root.render(<ArticlesPanel />));
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Please wait 15 minutes" }, { status: 429 }),
    );
    await retry();
    expect(container.textContent).toContain("Please wait 15 minutes");
    expect(container.textContent).toContain("A web tutorial");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("disables refresh during ingestion and aborts client work when the panel unmounts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(feed));
    await act(() => root.render(<ArticlesPanel />));
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    await act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Refresh articles"]')!.click(),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Refresh articles"]')!.disabled,
    ).toBe(true);
    const signal = vi.mocked(fetch).mock.calls[1][1]!.signal!;
    await act(() => root.render(null));
    expect(signal.aborted).toBe(true);
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
    expect(container.textContent).not.toContain("Open articles");
    expect(
      container.querySelector('.articles-service-state button[aria-label="Pause Daily Articles"]'),
    ).not.toBeNull();
  });
});
