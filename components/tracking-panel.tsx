"use client";

import { ConsentDialog } from "./consent-dialog";
import { AGREEMENT_VERSION, agreementClauses } from "@/lib/tracking/agreement";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionLink, TrackingStatus } from "@/lib/tracking/types";
import { accountStatusLabels, deliveryStatusLabels } from "@/lib/tracking/presentation";
import { requestJson } from "@/lib/http/client";
import type { ActivityPlatform } from "@/lib/activity/types";
import { platformLabels, statusPaths } from "@/lib/tracking/platforms";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const friendlyDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00+05:30`));

export function TrackingPanel({
  initialStatus,
  platform = "leetcode",
}: {
  initialStatus: TrackingStatus;
  platform?: ActivityPlatform;
}) {
  const platformLabel = platformLabels[platform];
  const statusPath = statusPaths[platform];
  const router = useRouter();
  const checking = useRef(false);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [username, setUsername] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<ConnectionLink | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (status.username && !initialStatus.username) heading.current?.focus();
  }, [status.username, initialStatus.username]);

  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(link.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [link]);

  const refresh = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const signal = request.current?.signal;
    setRefreshing(true);
    setError("");
    try {
      const next = await requestJson<TrackingStatus>(statusPath, { signal });
      if (signal?.aborted) return;
      setStatus(next);
    } catch (failure) {
      if (signal?.aborted) return;
      setError(
        failure instanceof Error ? failure.message : "Could not refresh tracking. Try again.",
      );
    } finally {
      if (!signal?.aborted) setRefreshing(false);
      checking.current = false;
    }
  }, [statusPath]);

  useEffect(() => {
    if (!link || expired || status.connected) return;
    const started = Date.now();
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() < Date.parse(link.expiresAt))
        void refresh();
    };
    const timer = setInterval(() => {
      if (Date.now() - started < 120_000) check();
      else clearInterval(timer);
    }, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [link, expired, status.connected, refresh]);

  async function register() {
    if (busy) return;
    setBusy(true);
    setError("");
    const signal = request.current?.signal;
    try {
      const next = await requestJson<TrackingStatus>(statusPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          agreementVersion: AGREEMENT_VERSION,
          acceptedAgreement: true,
        }),
        signal,
      });
      if (!signal?.aborted) {
        setStatus(next);
        setAgreementOpen(false);
        router.refresh();
      }
    } catch (failure) {
      if (signal?.aborted) return;
      setError(failure instanceof Error ? failure.message : "Registration failed. Try again.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    const signal = request.current?.signal;
    try {
      const next = await requestJson<ConnectionLink>("/api/tracking/telegram-link", {
        method: "POST",
        signal,
      });
      if (signal?.aborted) return;
      setLink(next);
      setExpired(false);
    } catch (failure) {
      if (signal?.aborted) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not create a connection link. Try again.",
      );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  return (
    <section className="tracking-panel" aria-labelledby="setup-title">
      <div className="panel-heading">
        <p className="eyebrow">
          <span className="badge badge-active">Logged in</span>
        </p>
        <h2 id="setup-title" ref={heading} tabIndex={-1}>
          {status.username ? `${platformLabel} tracking` : `Add your ${platformLabel} username`}
        </h2>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status.username
          ? `${platformLabel} tracking is enabled. Username ${status.username} is fixed until you revoke this service. Telegram status: ${status.status}.`
          : ""}
      </p>
      {error && !agreementOpen && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {agreementOpen && (
        <ConsentDialog
          title={`${platformLabel} user agreement`}
          acknowledgment="I agree to these terms and confirm this is my own profile."
          confirmLabel="Accept & register"
          busy={busy}
          error={error}
          onCancel={() => {
            setAgreementOpen(false);
            setError("");
          }}
          onConfirm={() => void register()}
        >
          <p>
            Register <strong className="mono">{username.trim()}</strong> for{" "}
            <strong>{platformLabel}</strong>.
          </p>
          <ul>
            {agreementClauses.map((clause) => (
              <li key={clause}>{clause}</li>
            ))}
          </ul>
        </ConsentDialog>
      )}
      {!status.username ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (username.trim() && !busy) {
              setError("");
              setAgreementOpen(true);
            }
          }}
          className="registration-form"
          aria-busy={busy}
        >
          <label htmlFor={`${platform}-username`}>{platformLabel} username</label>
          <input
            id={`${platform}-username`}
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
            Your username stays fixed until you revoke the service. Check the spelling before
            continuing.
            {platform !== "leetcode" &&
              ` Only public profile data is accessed; ${platformLabel} ownership is not verified.`}
          </p>
          <button
            className="button primary full-width"
            type="submit"
            disabled={busy || !username.trim()}
          >
            Continue to agreement
          </button>
        </form>
      ) : (
        <>
          <p className="tracking-note">
            <span className={`badge ${status.paused ? "" : "badge-active"}`}>
              {status.paused ? "Service paused" : "Service enabled"}
            </span>{" "}
            Open Dashboard from the navigation to view your activity.
          </p>
          <dl className="account-details">
            <div>
              <dt>{platformLabel} username</dt>
              <dd>
                <span className="mono">{status.username}</span>
                {platform === "leetcode" && <span className="badge">Locked</span>}
              </dd>
            </div>
            <div>
              <dt>Daily Grind</dt>
              <dd>
                <span className={`badge ${status.status === "active" ? "badge-active" : ""}`}>
                  {accountStatusLabels[status.status]}
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
                  ? `${friendlyDate(status.lastDelivery.reportDate)} · ${deliveryStatusLabels[status.lastDelivery.status]}`
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
                    This personal link expires in 15 minutes. Return here after Start; we’ll check
                    your connection automatically.
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
                {status.paused
                  ? "This service is paused. Daily data is still saved; resume from its service card to restore activity and future recaps."
                  : status.status === "active"
                    ? platform === "hackerrank"
                      ? "You’re set. HackerRank recaps will arrive automatically, using available public solved activity."
                      : platform === "gfg"
                        ? "You're set. GFG progress recaps will arrive automatically. Problems without verified solve dates are labeled as newly observed."
                        : "You're set. Yesterday's solved questions will arrive automatically. No daily commands needed."
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
