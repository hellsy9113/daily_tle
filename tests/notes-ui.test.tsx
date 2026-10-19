// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesSetup } from "@/components/notes-setup";
import { NotesPanel } from "@/components/notes-panel";
import type { NotesPageData } from "@/lib/notes/validation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const note = {
  id: "note-1",
  text: "A private thought",
  links: ["https://example.com/"],
  createdAt: "2026-10-19T10:00:00Z",
  updatedAt: "2026-10-19T10:00:00Z",
};
const page = (signedIn = true): NotesPageData => ({
  signedIn,
  expiresAt: signedIn ? null : new Date(Date.now() + 1200000).toISOString(),
  codeEnabled: true,
  notes: [note],
  nextOffset: null,
});

beforeEach(() => {
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
const render = (signedIn = true) => act(() => root.render(<NotesPanel signedIn={signedIn} />));
async function click(text: string) {
  await act(() => {
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text || button.getAttribute("aria-label") === text,
    )!;
    expect(button).toBeDefined();
    button.click();
  });
}
async function fill(id: string, text: string) {
  await act(() => {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
    const prototype =
      input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(field: string) {
  await act(() =>
    container
      .querySelector(`#${field}`)!
      .closest("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

describe("notes interface", () => {
  it("lets a visitor unlock only notes and clears the code after success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Locked" }, { status: 401 }));
    await render(false);
    expect(container.querySelector('button[aria-label="Unlock notes"]')).not.toBeNull();
    expect(container.querySelector("#note-text")).toBeNull();
    expect(container.querySelector('a[href="/api/auth/telegram/login?next=notes"]')).not.toBeNull();
    await fill("notes-code", "Note123");
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ unlocked: true }))
      .mockResolvedValueOnce(Response.json(page(false)));
    await submit("notes-code");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/notes/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "Note123" }),
      }),
    );
    expect(container.textContent).toContain(note.text);
    expect(container.querySelector('button[aria-label="Lock notes"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Register access code");
    expect(container.querySelector("#notes-code")).toBeNull();
  });
  it("automatically hides saved content and drafts after exactly 20 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page(false)));
    await render(false);
    await click("Add note");
    await fill("note-text", "An unsaved draft");
    await act(() => vi.advanceTimersByTimeAsync(1199999));
    expect(container.textContent).toContain(note.text);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(container.textContent).toContain("20-minute notes session has expired");
    expect(container.querySelector('button[aria-label="Unlock notes"]')).not.toBeNull();
    expect(container.textContent).not.toContain(note.text);
    expect(container.querySelector("#note-text")).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not apply guest expiry or code requirements to signed-in accounts", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page()));
    await render();
    await act(() => vi.advanceTimersByTimeAsync(21 * 60 * 1000));
    expect(container.textContent).toContain(note.text);
    expect(container.textContent).toContain("Normal sign-in has no Notes timer");
    expect(container.querySelector("#notes-code")).toBeNull();
    expect(container.querySelector("#note-text")).toBeNull();
    await click("Add note");
    expect(container.querySelector("dialog #note-text")).not.toBeNull();
  });
  it("shows a live word limit and submits text and links separately", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...page(), notes: [] }));
    await render();
    await click("Add note");
    await fill("note-text", Array(101).fill("word").join(" "));
    const save = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.getAttribute("aria-label") === "Save note",
      )!;
    expect(save().disabled).toBe(true);
    expect(container.querySelector("#note-text")!.getAttribute("aria-invalid")).toBe("true");
    await fill("note-text", "Remember this");
    await fill("note-links", "https://example.com/\nhttps://example.org/");
    expect(container.querySelector("#note-word-count")!.textContent).toContain("2 / 100 words");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...note, text: "Remember this" }));
    await submit("note-text");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          text: "Remember this",
          links: ["https://example.com/", "https://example.org/"],
        }),
      }),
    );
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.textContent).toContain("Note saved.");
  });
  it("keeps the draft on recoverable errors and requires confirmation before deletion", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page()));
    await render();
    await click("Edit note 1");
    await fill("note-text", "Updated thought");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Retry saving" }, { status: 503 }),
    );
    await submit("note-text");
    expect(container.querySelector<HTMLTextAreaElement>("#note-text")!.value).toBe(
      "Updated thought",
    );
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("Retry saving");
    await click("Close dialog");
    await click("Delete note 1");
    expect(fetch).toHaveBeenCalledTimes(2);
    await click("Keep note");
    expect(container.textContent).toContain(note.text);
    await click("Delete note 1");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await click("Confirm delete");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/notes/note-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(container.textContent).not.toContain(note.text);
    expect(container.textContent).toContain("No notes yet");
  });
  it("registers a simple code from Feature setup and changes it through management", async () => {
    const status = {
      username: null,
      registrationId: null,
      paused: false,
      connected: false,
      status: "pending" as const,
      lastDelivery: null,
    };
    await act(() => root.render(<NotesSetup initialStatus={status} />));
    expect(fetch).not.toHaveBeenCalled();
    await fill("notes-service-code", "Note123");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...status, username: "Private notebook", registrationId: "notebook-id" }),
    );
    await submit("notes-service-code");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracking/services/notes",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "Note123" }) }),
    );
    expect(container.querySelector<HTMLInputElement>("#notes-service-code")!.value).toBe("");
    await fill("notes-service-code", "New456");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ codeEnabled: true }));
    await submit("notes-service-code");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/notes/access",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "New456", registrationId: "notebook-id" }),
      }),
    );
    expect(container.textContent).toContain("Secret code changed");
  });
  it("keeps help hidden until clicked or focused and renders icons with accessible names", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page()));
    await render();
    const tooltip = container.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip.hidden).toBe(true);
    await click("Notes information");
    expect(tooltip.hidden).toBe(false);
    const add = container.querySelector('button[aria-label="Add note"]')!;
    expect(add.querySelector("svg")).not.toBeNull();
    expect(add.textContent).toBe("");
  });
  it("opens domains and search phrases in a new tab without requiring a scheme", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        ...page(),
        notes: [{ ...note, links: ["example.com/path", "binary search trees"] }],
      }),
    );
    await render();
    const links = [...container.querySelectorAll<HTMLAnchorElement>(".note-links a")];
    expect(links.map((link) => link.href)).toEqual([
      "https://example.com/path",
      "https://www.google.com/search?q=binary%20search%20trees",
    ]);
    expect(
      links.every((link) => link.target === "_blank" && link.rel === "noopener noreferrer"),
    ).toBe(true);
  });
  it("supports retry after loading fails without treating an outage as a code login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );
    await render();
    expect(container.textContent).toContain("Unavailable");
    expect(container.querySelector("#notes-code")).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page()));
    await click("Retry loading notes");
    expect(container.textContent).toContain(note.text);
  });
  it("locks a code session explicitly and removes private content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page(false)));
    await render(false);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ unlocked: false }));
    await click("Lock notes");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/notes/session",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(container.textContent).not.toContain(note.text);
    expect(container.querySelector('button[aria-label="Unlock notes"]')).not.toBeNull();
  });
});
