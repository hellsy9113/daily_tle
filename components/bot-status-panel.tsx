"use client";

import { useEffect } from "react";
import type { TrackingStatus } from "@/lib/tracking/types";
import { accountStatusLabels, deliveryStatusLabels } from "@/lib/tracking/presentation";
import { featurePaths, statusPaths, type FeatureId } from "@/lib/features/catalog";
import { useJsonResource, dashboardError } from "@/lib/http/use-json-resource";

export function BotStatusPanel({
  initialStatus,
  botUrl,
  statusPlatform,
}: {
  initialStatus: TrackingStatus;
  botUrl: string;
  statusPlatform: FeatureId;
}) {
  const { data, busy, error, refresh } = useJsonResource<TrackingStatus>(
    statusPaths[statusPlatform],
    {
      initialData: initialStatus,
      immediate: false,
      errorMessage: dashboardError,
    },
  );
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);
  const status = data ?? initialStatus;
  const latest = status.lastDelivery;
  return (
    <>
      <section className="bot-status-panel" aria-label="Telegram bot status">
        <div className="bot-status-heading">
          <div>
            <p className="eyebrow">Daily tracking</p>
            <span className={`badge ${status.status === "active" ? "badge-active" : ""}`}>
              {accountStatusLabels[status.status]}
            </span>
          </div>
          <div className="dashboard-actions">
            {status.connected ? (
              <a
                className="button secondary"
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open bot <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <a className="button secondary" href={featurePaths[statusPlatform]}>
                Connect Daily Grind <span aria-hidden="true">→</span>
              </a>
            )}
            <button className="text-button" onClick={() => void refresh()} disabled={busy}>
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <dl className="bot-status-details">
          <div>
            <dt>Daily report</dt>
            <dd>8:30–9:30 a.m. IST</dd>
          </div>
          <div>
            <dt>Latest report</dt>
            <dd>
              {latest
                ? `${latest.reportDate} · ${deliveryStatusLabels[latest.status]}`
                : status.connected
                  ? "Scheduled for the next morning"
                  : "Connect Daily Grind to schedule reports"}
            </dd>
          </div>
        </dl>
        <p className="field-help">
          {!status.connected
            ? "Your service is enabled. Connect Daily Grind once to receive Telegram recaps for all enabled services."
            : status.status === "blocked"
              ? "Unblock the bot and send /start to resume reports."
              : status.status === "paused"
                ? "Send /start in the bot to resume reports."
                : "Send /stop in the bot to pause, or /start to resume."}{" "}
          Delayed reports may arrive by 10:30 a.m. IST.
        </p>
      </section>
      {error && (
        <p className="inline-error" role="alert">
          {error} <a href="/feature">Sign-in &amp; services</a>
        </p>
      )}
    </>
  );
}
