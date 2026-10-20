"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionLink, TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { ServiceManagement } from "./service-control";

export function DailyGrindSetup({ initialStatus }: { initialStatus: TrackingStatus }) {
  const router = useRouter();
  const actionRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    actionRequest.current = new AbortController();
    return () => actionRequest.current?.abort();
  }, []);
  const [status, setStatus] = useState(initialStatus);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<ConnectionLink | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(link.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [link]);
  useEffect(() => {
    if (!link || expired || status.connected) return;
    const controller = new AbortController();
    let checking = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || checking) return;
      checking = true;
      try {
        const next = await requestJson<TrackingStatus>("/api/tracking/services/daily-grind", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setStatus(next);
      } catch {
        /* The explicit check below reports errors. */
      } finally {
        checking = false;
      }
    };
    const started = Date.now();
    const poll = setInterval(() => {
      if (Date.now() - started < 120_000) void check();
      else clearInterval(poll);
    }, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort();
      clearInterval(poll);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [link, expired, status.connected, status.registrationId]);
  async function act(action: "register" | "connect" | "check") {
    if (busy) return;
    const signal = actionRequest.current?.signal;
    setBusy(true);
    setError("");
    try {
      if (action === "connect") {
        const nextLink = await requestJson<ConnectionLink>("/api/tracking/telegram-link", {
          signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId: status.registrationId }),
        });
        if (signal?.aborted) return;
        setLink(nextLink);
        setExpired(false);
      } else {
        const next = await requestJson<TrackingStatus>(
          "/api/tracking/services/daily-grind",
          action === "register"
            ? {
                signal,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agreementVersion: "1", acceptedAgreement: true }),
              }
            : { signal },
        );
        if (signal?.aborted) return;
        setStatus(next);
        router.refresh();
      }
    } catch (failure) {
      if (signal?.aborted) return;
      setError(failure instanceof Error ? failure.message : "Could not update Daily Grind.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  return (
    <section className="tracking-panel" aria-labelledby="daily-grind-title">
      <h2 id="daily-grind-title">
        {status.registrationId ? "Manage Daily Grind" : "Enable Daily Grind"}
      </h2>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!status.registrationId ? (
        <>
          <p>
            Receive daily and Sunday weekly recaps for your enabled coding platforms in Telegram.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            I agree to connect my Telegram account and receive scheduled practice recaps. I can
            pause or revoke Daily Grind at any time.
          </label>
          <button
            className="button primary"
            disabled={busy || !accepted}
            onClick={() => void act("register")}
          >
            {busy ? "Enabling…" : "Enable Daily Grind"}
          </button>
        </>
      ) : (
        <>
          <p>
            {status.paused
              ? "Paused on the website"
              : status.connected
                ? status.status === "active"
                  ? "Telegram connected"
                  : "Telegram delivery paused or blocked. Send /start in the bot to resume."
                : "Connect Telegram to finish setup."}
          </p>
          <ServiceManagement
            platform="daily-grind"
            status={status}
            onChange={(next) => {
              actionRequest.current?.abort();
              actionRequest.current = new AbortController();
              setBusy(false);
              setStatus(next);
              setLink(null);
              if (!next.registrationId) setAccepted(false);
            }}
          />
          {!status.paused && !status.connected && (
            <div className="connect-area">
              <p>
                Open your personal link in Telegram and tap Start. Use a Telegram account that is
                not linked to another Track.it account.
              </p>
              {link && !expired ? (
                <a
                  className="button primary"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Telegram and tap Start ↗
                </a>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void act("connect")}
                >
                  {expired ? "Create new connection link" : "Connect Telegram"}
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={() => void act("check")}>
                Check connection
              </button>
            </div>
          )}
          {status.connected && (
            <p className="field-help">
              Daily recaps: 8:30–9:30 a.m. IST. Use /stop and /start in Telegram to pause or resume
              delivery.
            </p>
          )}
        </>
      )}
    </section>
  );
}
