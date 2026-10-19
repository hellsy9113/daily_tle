"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  NOTE_LINK_LIMIT,
  NOTE_WORD_LIMIT,
  wordCount,
  type NotesPageData,
  type SavedNote,
} from "@/lib/notes/validation";

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
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new NotesRequestError(
      data.error || "Could not save your changes. Please retry.",
      response.status,
    );
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
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const [text, setText] = useState("");
  const [linksText, setLinksText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(false);
  const loadingRequest = useRef<AbortController | null>(null);
  const words = wordCount(text);
  const links = linksText
    .split(/\r?\n/)
    .map((link) => link.trim())
    .filter(Boolean);

  const handleError = useCallback((value: unknown) => {
    if (!mounted.current) return;
    if (value instanceof NotesRequestError && value.status === 401) {
      setData(null);
      setLocked(true);
      setText("");
      setLinksText("");
      setEditing(null);
    }
    setError(value instanceof Error ? value.message : "Something went wrong. Please retry.");
  }, []);

  const load = useCallback(() => {
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    return request<NotesPageData>("/api/notes", "GET", undefined, controller.signal)
      .then((result) => {
        if (mounted.current && !controller.signal.aborted) {
          setData(result);
          setLocked(false);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof NotesRequestError && error.status === 401 && !signedIn) {
          if (mounted.current) {
            setData(null);
            setLocked(true);
          }
        } else handleError(error);
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
    } catch (error) {
      handleError(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function clearEditor() {
    setText("");
    setLinksText("");
    setEditing(null);
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
      editor.current?.focus();
    });
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (data?.signedIn && code !== confirmation) {
      setError("The codes do not match.");
      return;
    }
    void act(async () => {
      if (data?.signedIn) {
        await request("/api/notes/access", "POST", { code });
        setData({ ...data, codeEnabled: true });
        setNotice(
          "Code saved. Previous code sessions have been locked. Keep your code somewhere safe.",
        );
      } else {
        await request("/api/notes/session", "POST", { code });
        await load();
      }
      setCode("");
      setConfirmation("");
      setShowCode(false);
    });
  }

  function generateCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    setCode(generated);
    setConfirmation(generated);
    setShowCode(true);
    setNotice("Generated a secret code. Save it somewhere safe before registering it.");
  }

  return (
    <section className="notes-space" aria-label="Private notes" aria-busy={busy || loading}>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="notes-notice" role="status">
        {notice}
      </p>
      {loading && <p role="status">Loading your notes…</p>}
      {!loading && !data && !locked && (
        <button
          className="button"
          onClick={() => {
            setLoading(true);
            setError("");
            void load();
          }}
        >
          Retry loading notes
        </button>
      )}
      {!loading && locked && (
        <div className="tracking-panel notes-access">
          <h2>Unlock your notes</h2>
          <p>
            Enter the secret code you registered for Notes. It opens your notes only, for 20
            minutes.
          </p>
          <form className="registration-form notes-form" onSubmit={submitCode}>
            <label htmlFor="notes-code">Secret access code</label>
            <input
              id="notes-code"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={128}
              required
              disabled={busy}
            />
            <button className="button" disabled={busy || !code}>
              {busy ? "Unlocking…" : "Unlock notes"}
            </button>
          </form>
          <p className="field-help">
            First visit or forgotten code?{" "}
            <a href="/api/auth/telegram/login?next=/notes">Sign in with Telegram</a>, then register
            or replace your notes code.
          </p>
          <p className="muted">
            Anyone with your code can read, edit, and delete your notes. Do not share it.
          </p>
        </div>
      )}
      {!loading && data && (
        <>
          <div className="notes-toolbar">
            <p>
              {data.signedIn
                ? "Your private notebook"
                : "Unlocked with your notes code · automatically locks after 20 minutes"}
            </p>
            {!data.signedIn && (
              <button
                className="button"
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
              >
                Lock notes
              </button>
            )}
          </div>
          {!data.signedIn && (
            <p className="field-help">
              Save before your session ends. Unsaved drafts are cleared when Notes locks.
            </p>
          )}
          <form className="tracking-panel registration-form notes-form" onSubmit={saveNote}>
            <h2>{editing ? "Edit note" : "Write a note"}</h2>
            <label htmlFor="note-text">Note text</label>
            <textarea
              ref={editor}
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
              {words} / {NOTE_WORD_LIMIT} words · Links below do not count toward this limit.
            </p>
            <label htmlFor="note-links">Links (optional)</label>
            <textarea
              id="note-links"
              value={linksText}
              onChange={(event) => setLinksText(event.target.value)}
              rows={3}
              maxLength={21000}
              placeholder="https://example.com"
              aria-describedby="note-links-help"
              disabled={busy}
            />
            <p id="note-links-help" className="field-help">
              One full HTTP or HTTPS link per line. Up to {NOTE_LINK_LIMIT} links.
            </p>
            <div className="notes-actions">
              <button
                className="button"
                disabled={
                  busy ||
                  words > NOTE_WORD_LIMIT ||
                  links.length > NOTE_LINK_LIMIT ||
                  (!text.trim() && !links.length)
                }
              >
                {busy ? "Saving…" : editing ? "Update note" : "Save note"}
              </button>
              {editing && (
                <button type="button" className="button" disabled={busy} onClick={clearEditor}>
                  Cancel editing
                </button>
              )}
            </div>
          </form>
          {data.signedIn && (
            <details className="tracking-panel notes-access">
              <summary>Code access {data.codeEnabled ? "· enabled" : "· not registered"}</summary>
              <p>
                Register a secret code to open this notebook for 20 minutes without signing in to
                Telegram. Your normal website sign-in has no notes timer. You can replace a
                forgotten code here whenever you are signed in.
              </p>
              <p className="muted">
                Anyone with the code can read, edit, or delete your notes. Choose 20–128 characters
                or generate a code. Replacing or disabling it locks all existing code sessions.
              </p>
              <form className="registration-form notes-form" onSubmit={submitCode}>
                <label htmlFor="new-notes-code">
                  {data.codeEnabled ? "New secret code" : "Choose a secret code"}
                </label>
                <input
                  id="new-notes-code"
                  type={showCode ? "text" : "password"}
                  autoComplete="new-password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  minLength={20}
                  maxLength={128}
                  required
                  disabled={busy}
                />
                <div className="notes-actions">
                  <button type="button" className="button" onClick={generateCode} disabled={busy}>
                    Generate code
                  </button>
                  <button
                    type="button"
                    className="button"
                    aria-pressed={showCode}
                    onClick={() => setShowCode(!showCode)}
                  >
                    {showCode ? "Hide code" : "Show code"}
                  </button>
                </div>
                <label htmlFor="confirm-notes-code">Confirm secret code</label>
                <input
                  id="confirm-notes-code"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={20}
                  maxLength={128}
                  required
                  disabled={busy}
                />
                <button
                  className="button"
                  disabled={busy || code.length < 20 || code !== confirmation}
                >
                  {data.codeEnabled ? "Replace access code" : "Register access code"}
                </button>
              </form>
              {data.codeEnabled && (
                <div className="notes-actions">
                  {disableConfirm ? (
                    <>
                      <p>
                        Lock all code sessions and disable code access? Your notes will stay saved.
                      </p>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request("/api/notes/access", "DELETE");
                            setData({ ...data, codeEnabled: false });
                            setDisableConfirm(false);
                            setNotice(
                              "Code access disabled. Your notes are still available when signed in.",
                            );
                          })
                        }
                      >
                        Confirm disable code
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setDisableConfirm(false)}
                      >
                        Keep code access
                      </button>
                    </>
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setDisableConfirm(true)}
                    >
                      Disable code access
                    </button>
                  )}
                </div>
              )}
            </details>
          )}
          <section aria-labelledby="saved-notes-title">
            <h2 id="saved-notes-title">Saved notes</h2>
            {!data.notes.length && (
              <p className="muted">No notes yet. Save your first thought or link above.</p>
            )}
            <div className="notes-list">
              {data.notes.map((note, index) => (
                <article
                  className="tracking-panel note-card"
                  key={note.id}
                  aria-label={`Note ${index + 1}`}
                >
                  <p className="note-content">{note.text}</p>
                  {note.links.length > 0 && (
                    <ul aria-label="Saved links">
                      {note.links.map((link) => (
                        <li key={link}>
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <time className="muted" dateTime={note.updatedAt}>
                    Updated {new Date(note.updatedAt).toLocaleString()}
                  </time>
                  <div className="notes-actions">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(note.id);
                        setText(note.text);
                        setLinksText(note.links.join("\n"));
                        setNotice("");
                        editor.current?.focus();
                      }}
                    >
                      Edit note {index + 1}
                    </button>
                    {deleting === note.id ? (
                      <>
                        <span>Delete this note permanently?</span>
                        <button
                          className="button danger"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await request(`/api/notes/${note.id}`, "DELETE");
                              setData(
                                (current) =>
                                  current && {
                                    ...current,
                                    notes: current.notes.filter((item) => item.id !== note.id),
                                    nextOffset:
                                      current.nextOffset === null ? null : current.nextOffset - 1,
                                  },
                              );
                              if (editing === note.id) clearEditor();
                              setDeleting(null);
                              setNotice("Note deleted.");
                            })
                          }
                        >
                          Confirm delete
                        </button>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => setDeleting(null)}
                        >
                          Keep note
                        </button>
                      </>
                    ) : (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setDeleting(note.id)}
                      >
                        Delete note {index + 1}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {data.nextOffset !== null && (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const page = await request<NotesPageData>(
                      `/api/notes?offset=${data.nextOffset}`,
                    );
                    setData({
                      ...page,
                      notes: [
                        ...data.notes,
                        ...page.notes.filter(
                          (note) => !data.notes.some((old) => old.id === note.id),
                        ),
                      ],
                    });
                  })
                }
              >
                Load more notes
              </button>
            )}
          </section>
        </>
      )}
    </section>
  );
}
