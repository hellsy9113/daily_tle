"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/http/client";
import { parseUsername } from "@/lib/leetcode/validation";
import type { RecentSolvedQuestions } from "@/lib/leetcode/types";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function LeetCodeDemo({ botUrl }: { botUrl: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<RecentSolvedQuestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const resultList = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previous = document.activeElement;
    const trigger = launcher.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    resultList.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected)
        previous.focus();
      else trigger?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (result && dialog.current?.open) resultList.current?.focus();
  }, [result]);
  function close() {
    request.current?.abort();
    setBusy(false);
    setOpen(false);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let handle: string;
    try {
      handle = parseUsername(username);
    } catch {
      setError("Enter your LeetCode username without spaces.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const next = await requestJson<RecentSolvedQuestions>(
        `/api/user/recent-solved/${encodeURIComponent(handle)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setResult(next);
        setOpen(true);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Could not load this profile. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="leetcode-demo" id="demo" aria-labelledby="demo-title">
      <div className="landing-section-heading demo-heading">
        <div>
          <p className="eyebrow">Try it live · No sign-in needed</p>
          <h2 id="demo-title">Revisit your recent LeetCode solves.</h2>
          <p>Look up a public profile and open its recently Accepted problems.</p>
        </div>
        <a
          className="button secondary demo-bot-link"
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open query bot <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <form className="demo-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="demo-username">LeetCode username</label>
        <div className="demo-input-row">
          <input
            id="demo-username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. lee215"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
            required
            aria-describedby="demo-help"
            aria-invalid={Boolean(error)}
          />
          <button
            ref={launcher}
            type="submit"
            className="button primary"
            disabled={busy}
            aria-haspopup="dialog"
          >
            {busy ? "Finding problems…" : "Show solved problems"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p id="demo-help" className="field-help">
          A public lookup only. Your username is not registered or linked to an account.
        </p>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="field-help" role="status">
          Fetching public Accepted submissions…
        </p>
      )}
      {result && !open && (
        <button
          className="text-button"
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          View previous results · {result.username}
        </button>
      )}
      <p className="demo-bot-note">
        Prefer Telegram? The original query bot gives you profile summaries and recent, daily, or
        weekly results on demand. Send <code>/command</code> to see its queries. Daily Grind is a
        separate, optional recap feature.
      </p>
      {open && (
        <dialog
          ref={dialog}
          className="demo-dialog"
          aria-label={`Recent solved questions for ${result?.username ?? "LeetCode"}`}
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className="demo-dialog-heading">
            <button
              type="button"
              className="button secondary icon-button"
              aria-label="Close recent solved questions"
              onClick={close}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {result ? (
            <div className="demo-results" aria-busy={busy}>
              {result.questions.length ? (
                <div
                  ref={resultList}
                  className="demo-results-scroll"
                  role="region"
                  aria-label="Recent solved questions list"
                  tabIndex={0}
                >
                  <ul className="demo-problem-grid demo-problem-list">
                    {result.questions.map((problem, index) => (
                      <li key={problem.titleSlug}>
                        <a
                          href={`https://leetcode.com/problems/${encodeURIComponent(problem.titleSlug)}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="demo-problem-meta">
                            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                            <span className="demo-accepted">Accepted</span>
                          </div>
                          <h4>{problem.title}</h4>
                          <time dateTime={new Date(Number(problem.timestamp) * 1000).toISOString()}>
                            {dateFormatter.format(new Date(Number(problem.timestamp) * 1000))} IST
                          </time>
                          <span className="demo-open">
                            Open problem <span aria-hidden="true">↗</span>
                            <span className="sr-only"> (opens in a new tab)</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div ref={resultList} tabIndex={-1} className="demo-empty" role="status">
                  No recently Accepted problems were found in this public feed. This does not mean
                  the account has never solved a problem.
                </div>
              )}
            </div>
          ) : null}
        </dialog>
      )}
    </section>
  );
}
