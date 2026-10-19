// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesPanel } from "@/components/notes-panel";
import type { NotesPageData } from "@/lib/notes/validation";

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
      (button) => button.textContent === text,
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
    expect(container.textContent).toContain("Unlock your notes");
    expect(container.querySelector("#note-text")).toBeNull();
    expect(
      container.querySelector('a[href="/api/auth/telegram/login?next=/notes"]'),
    ).not.toBeNull();
    await fill("notes-code", "my-private-notebook-access-2026");
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ unlocked: true }))
      .mockResolvedValueOnce(Response.json(page(false)));
    await submit("notes-code");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/notes/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "my-private-notebook-access-2026" }),
      }),
    );
    expect(container.textContent).toContain(note.text);
    expect(container.textContent).toContain("Lock notes");
    expect(container.textContent).not.toContain("Register access code");
    expect(container.querySelector("#notes-code")).toBeNull();
  });
  it("automatically hides saved content and drafts after exactly 20 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(page(false)));
    await render(false);
    await fill("note-text", "An unsaved draft");
    await act(() => vi.advanceTimersByTimeAsync(1199999));
    expect(container.textContent).toContain(note.text);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(container.textContent).toContain("20-minute notes session has expired");
    expect(container.textContent).toContain("Unlock your notes");
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
    expect(container.textContent).toContain("Your normal website sign-in has no notes timer");
    expect(container.querySelector("#notes-code")).toBeNull();
    expect(container.querySelector("#note-text")).not.toBeNull();
  });
  it("shows a live word limit and submits text and links separately", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...page(), notes: [] }));
    await render();
    await fill("note-text", Array(101).fill("word").join(" "));
    const save = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Save note",
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
    expect(container.querySelector<HTMLTextAreaElement>("#note-text")!.value).toBe("");
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
  it("generates a secret code and registers it without exposing account identifiers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...page(), codeEnabled: false }));
    await render();
    await click("Generate code");
    const generated = container.querySelector<HTMLInputElement>("#new-notes-code")!.value;
    expect(generated).toMatch(/^[a-f0-9]{48}$/);
    expect(container.querySelector<HTMLInputElement>("#confirm-notes-code")!.value).toBe(generated);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ codeEnabled: true }));
    await submit("new-notes-code");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/notes/access",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: generated }) }),
    );
    expect(container.querySelector<HTMLInputElement>("#new-notes-code")!.value).toBe("");
    expect(container.textContent).toContain("Previous code sessions have been locked");
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
    expect(container.textContent).toContain("Unlock your notes");
  });
});
