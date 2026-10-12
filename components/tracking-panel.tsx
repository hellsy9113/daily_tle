"use client";

import { useEffect, useRef, useState } from "react";

export interface TrackingStatus {
  username: string | null;
  connected: boolean;
  status: string;
  lastDelivery: { reportDate: string; status: string; sentAt: string | null } | null;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.error === "string" ? body.error : "Something went wrong. Try again.",
    );
  return body;
}

const friendlyDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T12:00:00+05:30`));

export function TrackingPanel({ initialStatus }: { initialStatus: TrackingStatus }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [username, setUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (status.username && !initialStatus.username) heading.current?.focus();
  }, [status.username, initialStatus.username]);

  useEffect(() => {
    if (!link) return;
    const update = () => setExpired(Date.now() >= Date.parse(link.expiresAt));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [link]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      setStatus(await api<TrackingStatus>("/api/tracking"));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not refresh tracking. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setStatus(
        await api<TrackingStatus>("/api/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Registration failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      setLink(
        await api<{ url: string; expiresAt: string }>("/api/tracking/telegram-link", {
          method: "POST",
        }),
      );
      setExpired(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not create a connection link. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tracking-panel" aria-labelledby="setup-title">
      <div className="panel-heading">
        <p className="eyebrow">{status.username ? "Your account" : "One-time setup"}</p>
        <h2 id="setup-title" ref={heading} tabIndex={-1}>
          {status.username ? "Daily tracking" : "Add your LeetCode username"}
        </h2>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status.username
          ? status.status === "active"
            ? "Telegram is connected. Daily tracking is active."
            : `Username ${status.username} is permanently registered. Telegram status: ${status.status}.`
          : ""}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!status.username ? (
        <form onSubmit={register} className="registration-form" aria-busy={busy}>
          <label htmlFor="leetcode-username">LeetCode username</label>
          <input
            id="leetcode-username"
            name="username"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            maxLength={100}
            pattern="\S+"
            aria-describedby="username-help"
            disabled={busy}
            placeholder="your_username"
          />
          <p id="username-help" className="field-help">
            Your username is permanent once registered. Check the spelling before continuing.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              required
              disabled={busy}
            />
            <span>I understand that this username cannot be changed.</span>
          </label>
          <button
            className="button primary full-width"
            type="submit"
            disabled={busy || !confirmed || !username.trim()}
          >
            {busy ? "Checking username…" : "Register permanently"}
          </button>
        </form>
      ) : (
        <>
          <dl className="account-details">
            <div>
              <dt>LeetCode username</dt>
              <dd>
                <span className="mono">{status.username}</span>
                <span className="badge">Locked</span>
              </dd>
            </div>
            <div>
              <dt>Telegram</dt>
              <dd>
                <span className={`badge ${status.status === "active" ? "badge-active" : ""}`}>
                  {status.status === "active"
                    ? "Connected"
                    : status.status === "paused"
                      ? "Paused"
                      : status.status === "blocked"
                        ? "Blocked"
                        : "Awaiting connection"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Delivery window</dt>
              <dd>8:30–9:30 a.m. IST, daily</dd>
            </div>
            <div>
              <dt>Latest report</dt>
              <dd>
                {status.lastDelivery
                  ? `${friendlyDate(status.lastDelivery.reportDate)} · ${status.lastDelivery.status === "sent" ? "Delivered" : status.lastDelivery.status === "cancelled" ? "Paused" : status.lastDelivery.status === "failed" ? "Could not deliver" : "Pending"}`
                  : "Your first report is scheduled after connection."}
              </dd>
            </div>
          </dl>
          {!status.connected ? (
            <div className="connect-area">
              <p>
                Connect the same Telegram account you used to sign in. Tap <strong>Start</strong> in
                the bot to finish setup.
              </p>
              {link && !expired ? (
                <>
                  <a
                    className="button primary full-width"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Telegram and tap Start <span aria-hidden="true">↗</span>
                  </a>
                  <p className="field-help" role="status">
                    This personal link expires in 15 minutes.
                  </p>
                </>
              ) : (
                <>
                  {expired && (
                    <p className="field-help" role="status">
                      Your connection link expired. Create a new one to continue.
                    </p>
                  )}
                  <button className="button primary full-width" onClick={connect} disabled={busy}>
                    {busy
                      ? "Preparing connection…"
                      : expired
                        ? "Create new connection link"
                        : "Connect Telegram"}
                  </button>
                </>
              )}
              <button
                className="text-button refresh-button"
                onClick={refresh}
                disabled={refreshing}
              >
                {refreshing ? "Checking connection…" : "I tapped Start — check connection"}
              </button>
            </div>
          ) : (
            <div className="tracking-note">
              <p>
                {status.status === "active"
                  ? "You're set. Yesterday's solved questions will arrive automatically. No daily commands needed."
                  : status.status === "blocked"
                    ? "Unblock the bot in Telegram, then send /start to resume your reports."
                    : "Send /start to the bot when you're ready to resume."}
              </p>
              <p className="field-help">
                Use /stop in the bot to pause. Delayed reports may arrive during the 9:30–10:30 a.m.
                recovery window.
              </p>
              <button className="text-button" onClick={refresh} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh status"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
