// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelHeader } from "@/components/activity-panel-header";

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
});
const render = (busy = false, onRefresh = vi.fn()) =>
  act(() =>
    root.render(
      <ActivityPanelHeader
        titleId="chart-title"
        platform="LeetCode"
        username="user"
        busy={busy}
        onRefresh={onRefresh}
      >
        <p>Public history is limited.</p>
      </ActivityPanelHeader>,
    ),
  );
const trigger = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="LeetCode chart information"]')!;
const popup = () => container.querySelector<HTMLDivElement>('[role="tooltip"]')!;
async function pointer(
  target: Element,
  type: string,
  relatedTarget: EventTarget | null = null,
  pointerType = "mouse",
) {
  await act(() => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    target.dispatchEvent(event);
  });
}
describe("shared chart information popup", () => {
  it("hides explanations by default and opens a hoverable popup beside Refresh", async () => {
    await render();
    expect(popup().hidden).toBe(true);
    expect(trigger().parentElement?.previousElementSibling?.textContent).toBe("Refresh LeetCode");
    await pointer(trigger(), "pointerover");
    expect(popup().hidden).toBe(false);
    expect(trigger().getAttribute("aria-describedby")).toBe(popup().id);
    expect(popup().textContent).toContain("Select a calendar day");
    expect(popup().textContent).toContain("Public history is limited");
    await pointer(trigger(), "pointerout", popup());
    expect(popup().hidden).toBe(false);
    await pointer(popup(), "pointerout", document.body);
    expect(popup().hidden).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens on keyboard focus, stays while focused, and dismisses with Escape without moving focus", async () => {
    await render();
    await act(() => trigger().focus());
    expect(popup().hidden).toBe(false);
    await pointer(trigger(), "pointerout", document.body);
    expect(popup().hidden).toBe(false);
    await act(() =>
      trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(popup().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
    await act(() => trigger().blur());
    await act(() => trigger().focus());
    expect(popup().hidden).toBe(false);
    await act(() => trigger().blur());
    expect(popup().hidden).toBe(true);
  });
  it("opens on tap and dismisses on outside interaction", async () => {
    await render();
    await pointer(trigger(), "pointerover", null, "touch");
    expect(popup().hidden).toBe(true);
    await act(() => trigger().click());
    expect(popup().hidden).toBe(false);
    await pointer(document.body, "pointerdown");
    expect(popup().hidden).toBe(true);
  });
  it("places the popup above a control near the bottom of the viewport", async () => {
    await render();
    vi.spyOn(trigger().parentElement!, "getBoundingClientRect").mockReturnValue({
      top: window.innerHeight - 70,
      bottom: window.innerHeight - 26,
    } as DOMRect);
    await act(() => trigger().focus());
    expect(popup().dataset.side).toBe("above");
    expect(popup().hidden).toBe(false);
    expect(parseFloat(popup().style.getPropertyValue("--chart-info-space"))).toBeGreaterThan(0);
  });
  it("keeps information available while refreshing and preserves the Refresh action", async () => {
    const refresh = vi.fn();
    await render(true, refresh);
    const refreshButton = container.querySelector<HTMLButtonElement>(
      ".activity-panel-actions > button",
    )!;
    expect(refreshButton.disabled).toBe(true);
    expect(trigger().disabled).toBe(false);
    await act(() => trigger().click());
    expect(popup().hidden).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    await render(false, refresh);
    await act(() => refreshButton.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("uses independent popup IDs and consistent controls for all three panels", async () => {
    await act(() =>
      root.render(
        <>
          {["LeetCode", "GFG", "HackerRank"].map((platform) => (
            <ActivityPanelHeader
              key={platform}
              titleId={`${platform}-title`}
              platform={platform}
              username="user"
              busy={false}
              onRefresh={vi.fn()}
            >
              <p>{platform} limitations</p>
            </ActivityPanelHeader>
          ))}
        </>,
      ),
    );
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
    expect(new Set(buttons.map((button) => button.getAttribute("aria-controls"))).size).toBe(3);
    for (const button of buttons) {
      await act(() => button.click());
      expect(document.getElementById(button.getAttribute("aria-controls")!)?.hidden).toBe(false);
    }
  });
});
