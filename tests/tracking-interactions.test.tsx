// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackingPanel } from "@/components/tracking-panel";
import type { TrackingStatus } from "@/lib/tracking/types";

const replace = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const router = { replace, refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const initial: TrackingStatus = {
  username: null,
  connected: false,
  status: "pending",
  lastDelivery: null,
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});
async function render(status = initial, platform: "leetcode" | "gfg" | "hackerrank" = "leetcode") {
  await act(() => root.render(<TrackingPanel initialStatus={status} platform={platform} />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(() => button!.click());
}
async function enterUsername(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[name="username"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function acknowledge() {
  await act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
}
async function submit() {
  await act(() =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

describe("registration and connection interactions", () => {
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "keeps Feature open after %s registration with an existing bot connection",
    async (platform) => {
      await render({ ...initial, connected: true, status: "active" }, platform);
      await enterUsername("gfg_user");
      await acknowledge();
      vi.mocked(fetch).mockResolvedValue(
        Response.json({ ...initial, username: "gfg_user", connected: true, status: "active" }),
      );
      await submit();
      expect(fetch).toHaveBeenCalledWith(
        platform === "leetcode" ? "/api/tracking" : `/api/tracking/${platform}`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(container.textContent).toContain("Logged in");
      expect(container.textContent).toContain("gfg_user");
      expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
      expect(replace).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
      expect(container.textContent).toContain("Service enabled");
    },
  );
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "updates a %s connection in place when the user returns from Telegram",
    async (platform) => {
      await render({ ...initial, username: "gfg_user" }, platform);
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({
          url: "https://t.me/test_bot?start=token",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
      );
      await click("Connect Telegram");
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({ ...initial, username: "gfg_user", connected: true, status: "active" }),
      );
      await act(() => window.dispatchEvent(new Event("focus")));
      expect(fetch).toHaveBeenLastCalledWith(
        platform === "leetcode" ? "/api/tracking" : `/api/tracking/${platform}`,
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(container.textContent).toContain("Logged in");
      expect(container.textContent).toContain("Connected");
      expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it.each([Response.json(null, { status: 502 }), new Response("Bad Gateway", { status: 502 })])(
    "shows safe retry feedback for an invalid error response",
    async (response) => {
      await render();
      await enterUsername("my_username");
      await acknowledge();
      vi.mocked(fetch).mockResolvedValue(response);
      await submit();
      expect(container.querySelector('[role="alert"]')!.textContent).toBe(
        "Something went wrong. Try again.",
      );
      expect(container.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe(
        "my_username",
      );
    },
  );
  it("cancels connection checks and prevents navigation after leaving setup", async () => {
    await render({ ...initial, username: "my_username" });
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await click("check connection");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(() => root.render(null));
    await act(() =>
      finish(
        Response.json({
          ...initial,
          username: "my_username",
          connected: true,
          status: "active",
        }),
      ),
    );
    expect(signal?.aborted).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
  it("keeps the typed username and acknowledgement after a recoverable failure", async () => {
    await render();
    await enterUsername("my_username");
    await acknowledge();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      false,
    );
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "LeetCode is temporarily unavailable." }, { status: 502 }),
    );
    await submit();
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe(
      "my_username",
    );
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      "temporarily unavailable",
    );
  });
  it("locks the registered username and moves keyboard focus to the next step", async () => {
    await render();
    await enterUsername("my_username");
    await acknowledge();
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...initial, username: "Canonical_User" }));
    await submit();
    expect(container.querySelector('input[name="username"]')).toBeNull();
    expect(container.textContent).toContain("Canonical_User");
    expect(document.activeElement?.id).toBe("setup-title");
    expect(container.querySelector('[role="status"]')!.textContent).toContain(
      "permanently registered",
    );
  });
  it("expires a personal link, offers regeneration, and refreshes the connection", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    vi.setSystemTime(new Date("2026-10-13T03:00:00Z"));
    await render({ ...initial, username: "my_username" });
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        url: "https://t.me/test_bot?start=private-token",
        expiresAt: "2026-10-13T03:15:00Z",
      }),
    );
    await click("Connect Telegram");
    expect(container.querySelector('a[href^="https://t.me/"]')).not.toBeNull();
    await act(() => vi.advanceTimersByTime(15 * 60 * 1000));
    expect(container.querySelector('a[href^="https://t.me/"]')).toBeNull();
    expect(container.textContent).toContain("Create new connection link");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...initial, username: "my_username", connected: true, status: "active" }),
    );
    await click("check connection");
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("No daily commands needed");
    expect(replace).not.toHaveBeenCalled();
  });
  it("checks on return from Telegram and keeps the service page open", async () => {
    await render({ ...initial, username: "my_username" });
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        url: "https://t.me/test_bot?start=token",
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    );
    await click("Connect Telegram");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...initial, username: "my_username", connected: true, status: "active" }),
    );
    await act(() => window.dispatchEvent(new Event("focus")));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(replace).not.toHaveBeenCalled();
  });
  it("polls briefly while waiting for Start and stops after connecting", async () => {
    vi.useFakeTimers();
    await render({ ...initial, username: "my_username" });
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        url: "https://t.me/test_bot?start=token",
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    );
    await click("Connect Telegram");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...initial, username: "my_username", connected: true, status: "active" }),
    );
    await act(() => vi.advanceTimersByTime(5000));
    expect(replace).not.toHaveBeenCalled();
    const count = vi.mocked(fetch).mock.calls.length;
    await act(() => vi.advanceTimersByTime(60_000));
    expect(fetch).toHaveBeenCalledTimes(count);
  });
});
