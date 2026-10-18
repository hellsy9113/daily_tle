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
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<RecentSolvedQuestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
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
          <h2 id="demo-title">Your latest Accepted, in view.</h2>
          <p>Enter a public LeetCode username to explore recently solved problems.</p>
        </div>
        <a
          className="button secondary demo-bot-link"
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open query bot <span aria-hidden="true">↗</span>
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
          <button type="submit" className="button primary" disabled={busy}>
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
      {result ? (
        <div className="demo-results" aria-busy={busy}>
          <div className="demo-results-heading">
            <h3 ref={resultHeading} tabIndex={-1}>
              Recent solves · {result.username}
            </h3>
            <span className="badge badge-active">
              {result.count} unique {result.count === 1 ? "problem" : "problems"}
            </span>
          </div>
          {result.questions.length ? (
            <ul className="demo-problem-grid">
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
          ) : (
            <p className="demo-empty" role="status">
              No recently Accepted problems were found in this public feed. This does not mean the
              account has never solved a problem.
            </p>
          )}
          <p className="field-help">
            Based on up to {result.sourceLimit} public Accepted submissions. Repeated solves appear
            once; older history may be missing. Dates use Asia/Kolkata.
          </p>
        </div>
      ) : (
        !busy && (
          <div className="demo-empty">
            <span className="demo-empty-mark" aria-hidden="true">
              ↗
            </span>
            <p>Your next lookup starts here.</p>
            <span>Find solved problems, revisit the links, and keep moving.</span>
          </div>
        )
      )}
      <p className="demo-bot-note">
        Prefer Telegram? The query bot gives you profile summaries and recent, daily, or weekly
        results on demand. Send <code>/command</code> to see its queries.
      </p>
    </section>
  );
}
