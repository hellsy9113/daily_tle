// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureDialog } from "@/components/feature-dialog";
import { NotesSetup } from "@/components/notes-setup";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

let container: HTMLDivElement;
let trigger: HTMLAnchorElement;
let root: Root;
let overflow: string;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
  replace.mockClear();
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  overflow = document.body.style.overflow;
  trigger = document.createElement("a");
  trigger.id = "feature-notes-action";
  trigger.href = "/feature?platform=notes";
  document.body.append(trigger);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  trigger.remove();
  document.body.style.overflow = overflow;
  delete environment.IS_REACT_ACT_ENVIRONMENT;
});

const render = () =>
  act(() =>
    root.render(
      <FeatureDialog title="Notes service" triggerId={trigger.id}>
        <NotesSetup
          initialStatus={{
            username: "Private notebook",
            registrationId: "notebook-id",
            paused: false,
            connected: false,
            status: "pending",
            lastDelivery: null,
          }}
        />
      </FeatureDialog>,
    ),
  );

describe("service management dialog", () => {
  it("opens management as a modal, focuses its heading, and prevents background scrolling", async () => {
    await render();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector("h2"));
    expect(container.querySelector("#notes-service-code")!.closest("dialog")).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes to the service catalog and returns focus to the triggering card", async () => {
    trigger.focus();
    document.body.style.overflow = "clip";
    await render();
    await act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close service management"]')!
        .click(),
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith("/feature", { scroll: false });
    await act(() => root.render(null));
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("clip");
  });

  it("supports Escape and restores focus after opening a direct service link", async () => {
    await render();
    const cancel = new Event("cancel", { cancelable: true });
    await act(() => container.querySelector("dialog")!.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(replace).toHaveBeenCalledExactlyOnceWith("/feature", { scroll: false });
    await act(() => root.render(null));
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps management open when a nested deletion confirmation is cancelled", async () => {
    await render();
    const revoke = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Revoke & delete data",
    )!;
    await act(() => revoke.click());
    const dialogs = container.querySelectorAll("dialog");
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].open).toBe(true);
    expect(dialogs[1].querySelector<HTMLButtonElement>("button.danger")!.disabled).toBe(true);
    await act(() =>
      dialogs[1].dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })),
    );
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
    expect(dialogs[0].open).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
