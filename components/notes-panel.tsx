"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  NOTE_LINK_LIMIT,
  NOTE_WORD_LIMIT,
  wordCount,
  noteLinkTarget,
  type NotesPageData,
  type SavedNote,
} from "@/lib/notes/validation";
import { NotesIcon, NotesIconButton } from "./notes-icons";
import { NotesDialog } from "./notes-dialog";
import { InfoPopover } from "./info-popover";

class NotesRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new NotesRequestError(data.error || "Please retry your request.", response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function NotesPanel({ signedIn }: { signedIn: boolean }) {
  const [data, setData] = useState<NotesPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [code, setCode] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [text, setText] = useState("");
  const [linksText, setLinksText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const mounted = useRef(false);
  const loadingRequest = useRef<AbortController | null>(null);
  const words = wordCount(text);
  const links = linksText
    .split(/\r?\n/)
    .map((link) => link.trim())
    .filter(Boolean);
  function clearEditor() {
    setText("");
    setLinksText("");
    setEditing(null);
    setEditorOpen(false);
  }
  const handleError = useCallback((value: unknown) => {
    if (!mounted.current) return;
    if (value instanceof NotesRequestError && [401, 403, 423].includes(value.status)) {
      setData(null);
      setLocked(value.status === 401);
      setBlocked(value.status !== 401);
      setEditorOpen(false);
      setText("");
      setLinksText("");
      setEditing(null);
      setDeleting(null);
    }
    setError(value instanceof Error ? value.message : "Something went wrong. Please retry.");
  }, []);
  const load = useCallback(() => {
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    return request<NotesPageData>("/api/notes", "GET", undefined, controller.signal)
      .then((result) => {
        if (!mounted.current || controller.signal.aborted) return;
        setData(result);
        setLocked(false);
        setBlocked(false);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof NotesRequestError && failure.status === 401 && !signedIn) {
          if (mounted.current) {
            setData(null);
            setLocked(true);
          }
        } else handleError(failure);
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });
  }, [handleError, signedIn]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadingRequest.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!data || data.signedIn || !data.expiresAt) return;
    const expiresAt = Date.parse(data.expiresAt);
    function checkExpiry() {
      if (Date.now() < expiresAt) return;
      setData(null);
      setLocked(true);
      setText("");
      setLinksText("");
      setEditing(null);
      setDeleting(null);
      setEditorOpen(false);
      setCode("");
      setNotice("Your 20-minute notes session has expired. Enter your code to unlock it again.");
    }
    const timer = window.setTimeout(checkExpiry, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [data]);
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function saveNote(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const saved = await request<SavedNote>(
        editing ? `/api/notes/${editing}` : "/api/notes",
        editing ? "PATCH" : "POST",
        { text, links },
      );
      setData(
        (current) =>
          current && {
            ...current,
            notes: editing
              ? current.notes.map((note) => (note.id === editing ? saved : note))
              : [saved, ...current.notes],
            nextOffset:
              !editing && current.nextOffset !== null ? current.nextOffset + 1 : current.nextOffset,
          },
      );
      setNotice(editing ? "Note updated." : "Note saved.");
      clearEditor();
    });
  }
  return (
    <section
      className="activity-panel notes-space"
      aria-label="Private notes"
      aria-busy={busy || loading}
    >
      <div className="activity-heading">
        <h2>Notes</h2>
        <div className="activity-panel-actions">
          {data && (
            <>
              <NotesIconButton
                icon="add"
                label="Add note"
                disabled={busy}
                onClick={() => {
                  clearEditor();
                  setError("");
                  setEditorOpen(true);
                }}
              />
              <NotesIconButton
                icon="refresh"
                label="Refresh notes"
                disabled={busy}
                onClick={() => void act(load)}
              />
              {data.signedIn ? (
                <Link
                  className="button secondary icon-button"
                  title="Manage Notes service"
                  aria-label="Manage Notes service"
                  href="/feature?platform=notes"
                >
                  <NotesIcon name="key" />
                </Link>
              ) : (
                <NotesIconButton
                  icon="lock"
                  label="Lock notes"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await request("/api/notes/session", "DELETE");
                      setData(null);
                      setLocked(true);
                      clearEditor();
                      setDeleting(null);
                      setNotice("Notes locked.");
                    })
                  }
                />
              )}
            </>
          )}
          <InfoPopover label="Notes information">
            Keep up to 100 words per note and 10 links or search phrases separately. Use Add to
            write a note. Domains open directly; phrases open a search in a new tab. Register or
            change your code in Feature → Manage service. Code sessions lock after 20 minutes; save
            your draft before expiry. Normal sign-in has no Notes timer.
          </InfoPopover>
        </div>
      </div>
      {error && !editorOpen && !deleting && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="notes-notice" role="status">
        {notice}
      </p>
      {loading && <p role="status">Loading your notes…</p>}
      {!loading && !data && !locked && !blocked && (
        <NotesIconButton
          icon="refresh"
          label="Retry loading notes"
          onClick={() => {
            setLoading(true);
            setError("");
            void load();
          }}
        />
      )}
      {blocked && (
        <Link href="/feature?platform=notes" className="button secondary">
          Manage Notes service
        </Link>
      )}
      {!loading && locked && (
        <form
          className="registration-form notes-form notes-unlock"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await request("/api/notes/session", "POST", { code });
              setCode("");
              await load();
            });
          }}
        >
          <label htmlFor="notes-code">Secret code</label>
          <div className="notes-code-row">
            <input
              id="notes-code"
              type="password"
              autoComplete="current-password"
              minLength={5}
              maxLength={9}
              pattern="[A-Za-z0-9]{5,9}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              disabled={busy}
            />
            <NotesIconButton
              type="submit"
              icon="lock"
              label="Unlock notes"
              disabled={busy || !code}
            />
          </div>
          <Link href="/api/auth/telegram/login?next=notes">
            Sign in to register or manage Notes
          </Link>
        </form>
      )}
      {!loading && data && (
        <>
          {!data.notes.length && (
            <p className="muted">No notes yet. Use the + button to add your first note.</p>
          )}
          <div className="notes-list">
            {data.notes.map((note, index) => (
              <article
                className="note-card tracking-panel"
                key={note.id}
                aria-label={`Note ${index + 1}`}
              >
                <p className="note-content">{note.text}</p>
                {note.links.length > 0 && (
                  <ul className="note-links" aria-label="Saved links">
                    {note.links.map((link) => (
                      <li key={link}>
                        <a
                          href={noteLinkTarget(link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          {link.replace(/^https?:\/\//i, "")}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="note-card-footer">
                  <time className="muted" dateTime={note.updatedAt}>
                    {new Date(note.updatedAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                  <div className="notes-actions">
                    <NotesIconButton
                      icon="edit"
                      label={`Edit note ${index + 1}`}
                      disabled={busy}
                      onClick={() => {
                        setEditing(note.id);
                        setText(note.text);
                        setLinksText(note.links.join("\n"));
                        setError("");
                        setEditorOpen(true);
                      }}
                    />
                    <NotesIconButton
                      icon="delete"
                      label={`Delete note ${index + 1}`}
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setDeleting(note.id);
                      }}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
          {data.nextOffset !== null && (
            <NotesIconButton
              icon="arrow"
              label="Load more notes"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const page = await request<NotesPageData>(`/api/notes?offset=${data.nextOffset}`);
                  setData({
                    ...page,
                    notes: [
                      ...data.notes,
                      ...page.notes.filter((note) => !data.notes.some((old) => old.id === note.id)),
                    ],
                  });
                })
              }
            />
          )}
        </>
      )}
      {editorOpen && (
        <NotesDialog title={editing ? "Edit note" : "Add note"} busy={busy} onClose={clearEditor}>
          <form className="registration-form notes-form" onSubmit={saveNote}>
            <label htmlFor="note-text">Note</label>
            <textarea
              id="note-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={10000}
              rows={5}
              aria-describedby="note-word-count"
              aria-invalid={words > NOTE_WORD_LIMIT}
              disabled={busy}
            />
            <p
              id="note-word-count"
              className={words > NOTE_WORD_LIMIT ? "inline-error" : "field-help"}
              aria-live="polite"
            >
              {words} / {NOTE_WORD_LIMIT} words
            </p>
            <div className="notes-label-row">
              <label htmlFor="note-links">Links or searches</label>
              <InfoPopover label="Link help">
                Add one entry per line, up to 10. For example: example.com, a full web link, or a
                search phrase. These do not count toward the word limit.
              </InfoPopover>
            </div>
            <textarea
              id="note-links"
              value={linksText}
              onChange={(event) => setLinksText(event.target.value)}
              rows={2}
              maxLength={21000}
              placeholder="example.com or a search phrase"
              disabled={busy}
            />
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <NotesIconButton
                type="submit"
                icon="save"
                label={editing ? "Update note" : "Save note"}
                disabled={
                  busy ||
                  words > NOTE_WORD_LIMIT ||
                  links.length > NOTE_LINK_LIMIT ||
                  (!text.trim() && !links.length)
                }
              />
            </div>
          </form>
        </NotesDialog>
      )}
      {deleting && (
        <NotesDialog title="Delete note?" busy={busy} onClose={() => setDeleting(null)}>
          <p>This permanently deletes this note and its links.</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <NotesIconButton
              icon="close"
              label="Keep note"
              disabled={busy}
              onClick={() => setDeleting(null)}
            />
            <NotesIconButton
              icon="delete"
              label="Confirm delete"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await request(`/api/notes/${deleting}`, "DELETE");
                  setData(
                    (current) =>
                      current && {
                        ...current,
                        notes: current.notes.filter((note) => note.id !== deleting),
                        nextOffset: current.nextOffset === null ? null : current.nextOffset - 1,
                      },
                  );
                  setDeleting(null);
                  setNotice("Note deleted.");
                })
              }
            />
          </div>
        </NotesDialog>
      )}
    </section>
  );
}
