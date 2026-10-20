// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePanel } from "@/components/profile-panel";
import { ServiceControl, PausedService } from "@/components/service-control";
import { TrackingPanel } from "@/components/tracking-panel";
import type { ProfileSummary } from "@/lib/profile";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const registrationId = "10000000-0000-4000-8000-000000000001";
const status = {
  username: "my_profile",
  connected: true,
  status: "active",
  lastDelivery: null,
  paused: false,
  registrationId,
} as const;
const profile: ProfileSummary = {
  telegramId: 101,
  createdAt: "2026-10-18T01:00:00Z",
  connected: true,
  status: "active",
  theme: null,
  services: ["leetcode", "gfg", "hackerrank"].map((platform) => ({
    platform: platform as "leetcode" | "gfg" | "hackerrank",
    ...status,
  })),
};
let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  refresh.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete document.documentElement.dataset.theme;
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});
const render = (element = <ProfilePanel initialProfile={profile} />) =>
  act(() => root.render(element));
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
async function click(label: string) {
  await act(() => {
    const button = buttons().find(
      (button) => button.textContent === label || button.getAttribute("aria-label") === label,
    )!;
    button.focus();
    button.click();
  });
}

describe("profile settings and confirmations", () => {
  it("shows account details, all platform rows, theme controls, and sign out", async () => {
    await render();
    expect(container.textContent).toContain("Telegram ID");
    expect(container.textContent).toContain("101");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.querySelector('form[action="/api/auth/logout"]')).not.toBeNull();
    expect(
      buttons().filter((button) => button.getAttribute("aria-pressed") === "false"),
    ).toHaveLength(2);
    expect(container.textContent).toContain("Following your device theme");
    expect(container.querySelector("#profile-timezone")).toBeNull();
    expect(container.querySelectorAll('a[href^="/feature?platform="]')).toHaveLength(3);
    expect(container.textContent).not.toContain("Revoke & delete data");
  });
  it.each(["light", "dark"] as const)(
    "saves %s mode and updates the document after success",
    async (theme) => {
      await render();
      vi.mocked(fetch).mockResolvedValue(Response.json({ theme }));
      await click(theme === "light" ? "Light mode" : "Dark mode");
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ theme });
      expect(container.querySelector('[aria-pressed="true"]')!.textContent).toContain(
        theme === "light" ? "Light" : "Dark",
      );
      expect(refresh).toHaveBeenCalledOnce();
    },
  );
  it("keeps the previous theme when saving fails", async () => {
    await render();
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "Please retry." }, { status: 503 }));
    await click("Dark mode");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("Please retry.");
  });
  it("requires acknowledgment, permits cancel, and clears only the revoked platform", async () => {
    await render(<TrackingPanel initialStatus={status} />);
    await click("Revoke & delete data");
    expect(container.querySelector<HTMLDialogElement>("dialog")!.open).toBe(true);
    expect(document.activeElement?.tagName).toBe("H2");
    expect(
      container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')!.checked,
    ).toBe(false);
    expect(
      buttons().find((button) => button.textContent === "Revoke & permanently delete")!.disabled,
    ).toBe(true);
    await click("Cancel");
    expect(fetch).not.toHaveBeenCalled();
    await click("Revoke & delete data");
    await act(() =>
      container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')!.click(),
    );
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ ...status, username: null, registrationId: null }),
    );
    await click("Revoke & permanently delete");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      registrationId,
      confirmPermanentDeletion: true,
    });
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('input[name="username"]')).not.toBeNull();
    expect(
      buttons().filter((button) => button.textContent === "Revoke & delete data"),
    ).toHaveLength(0);
    expect(container.querySelector('[role="status"]')!.textContent).toContain(
      "permanently deleted",
    );
  });
  it("closes consent with Escape and returns keyboard focus to its trigger", async () => {
    await render(<TrackingPanel initialStatus={status} />);
    await click("Revoke & delete data");
    const trigger = buttons().find((button) => button.textContent === "Revoke & delete data")!;
    await act(() =>
      container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })),
    );
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps deletion retryable without a false success state", async () => {
    await render(<TrackingPanel initialStatus={status} />);
    await click("Revoke & delete data");
    await act(() => container.querySelector<HTMLInputElement>("dialog input")!.click());
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "Could not delete. Try again." }, { status: 503 }),
    );
    await click("Revoke & permanently delete");
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Could not delete");
    expect(container.querySelector(".account-details .mono")?.textContent).toBe("my_profile");
  });
  it("sends pause/resume with the current generation and offers an accessible icon", async () => {
    await render(<ServiceControl platform="gfg" paused={false} registrationId={registrationId} />);
    const control = container.querySelector("button")!;
    expect(control.title).toBe("Pause GFG");
    expect(control.textContent).toBe("");
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...status, paused: true }));
    await click("Pause GFG");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      registrationId,
      paused: true,
    });
    expect(refresh).toHaveBeenCalledOnce();
    await render(<PausedService platform="gfg" username="my_profile" />);
    expect(container.textContent).toContain("Your daily data is still saved");
    expect(container.querySelector('a[href="/feature?platform=gfg"]')?.textContent).toBe(
      "Resume GFG",
    );
  });
  it("opens registration consent without fetching, preserves username on cancel, and resets acceptance", async () => {
    await render(
      <TrackingPanel initialStatus={{ ...status, username: null, registrationId: null }} />,
    );
    const input = container.querySelector<HTMLInputElement>('input[name="username"]')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "my_profile",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Continue to agreement");
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")!.textContent).toContain(
      "Do not use another person's profile",
    );
    expect(container.querySelector("dialog")!.textContent).toContain("my_profile");
    await act(() => container.querySelector<HTMLInputElement>("dialog input")!.click());
    await click("Cancel");
    expect(input.value).toBe("my_profile");
    expect(document.activeElement?.textContent).toBe("Continue to agreement");
    await click("Continue to agreement");
    expect(container.querySelector<HTMLInputElement>("dialog input")!.checked).toBe(false);
    await act(() => container.querySelector<HTMLInputElement>("dialog input")!.click());
    vi.mocked(fetch).mockResolvedValue(Response.json(status));
    await click("Accept & register");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      username: "my_profile",
      acceptedAgreement: true,
      agreementVersion: "1",
    });
  });
});
