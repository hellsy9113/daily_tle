import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TrackingPanel } from "@/components/tracking-panel";
import type { TrackingStatus } from "@/lib/tracking/types";
import { SiteShell } from "@/components/site-shell";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const initial: TrackingStatus = {
  username: null,
  connected: false,
  status: "pending",
  lastDelivery: null,
};

describe("tracking UI states", () => {
  it("labels the input, explains permanence and requires acknowledgement", () => {
    const html = renderToStaticMarkup(<TrackingPanel initialStatus={initial} />);
    expect(html).toContain('for="leetcode-username"');
    expect(html).toContain('aria-describedby="username-help"');
    expect(html).toContain("cannot be changed");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Register permanently");
    expect(html).toContain("disabled");
  });
  it("renders registered usernames read-only with one connection action", () => {
    const html = renderToStaticMarkup(
      <TrackingPanel initialStatus={{ ...initial, username: "registered_user" }} />,
    );
    expect(html).toContain("registered_user");
    expect(html).toContain("Locked");
    expect(html).not.toContain('name="username"');
    expect(html).toContain("Connect Telegram");
  });
  it.each(["active", "paused", "blocked"] as const)("renders the %s connection state", (status) => {
    const html = renderToStaticMarkup(
      <TrackingPanel initialStatus={{ ...initial, username: "user", connected: true, status }} />,
    );
    expect(html).toContain(
      status === "active" ? "Connected" : status === "paused" ? "Paused" : "Blocked",
    );
    expect(html).toContain("/stop");
    expect(html).not.toContain("Connect Telegram");
  });
  it("shows report failure without exposing infrastructure details", () => {
    const html = renderToStaticMarkup(
      <TrackingPanel
        initialStatus={{
          ...initial,
          username: "user",
          connected: true,
          status: "active",
          lastDelivery: { reportDate: "2026-10-12", status: "failed", sentAt: null },
        }}
      />,
    );
    expect(html).toContain("Could not deliver");
    expect(html).not.toMatch(/lease|database|postgres/i);
  });
  it("provides navigation, one main landmark and logout for authenticated users", () => {
    const html = renderToStaticMarkup(
      <SiteShell signedIn>
        <p>Content</p>
      </SiteShell>,
    );
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).not.toContain("Commands");
  });
});
