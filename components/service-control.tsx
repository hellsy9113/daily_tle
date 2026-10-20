"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConsentDialog } from "./consent-dialog";
import type { FeatureId } from "@/lib/features/catalog";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { platformLabels, featurePaths, statusPaths } from "@/lib/features/catalog";

export function ServiceControl({
  platform,
  paused,
  registrationId,
  onChange,
}: {
  platform: FeatureId;
  paused: boolean;
  registrationId: string;
  onChange?: (status: TrackingStatus) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = `${paused ? "Resume" : "Pause"} ${platformLabels[platform]}`;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestJson<TrackingStatus>(statusPaths[platform], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, paused: !paused }),
      });
      onChange?.(next);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update this service.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="service-control">
      <button
        type="button"
        className="button secondary icon-button"
        title={label}
        aria-label={label}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void toggle()}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          {paused ? (
            <path d="m8 5 11 7-11 7Z" />
          ) : (
            <>
              <path d="M8 5v14M16 5v14" />
            </>
          )}
        </svg>
      </button>
      {error && (
        <span className="inline-error control-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function PausedService({ platform, username }: { platform: FeatureId; username: string }) {
  return (
    <section
      className="activity-panel paused-service"
      aria-label={`${platformLabels[platform]} paused`}
    >
      <div className="activity-heading">
        <h2>
          {platformLabels[platform]} · {username}
        </h2>
        <Link className="button secondary" href={featurePaths[platform]}>
          Resume {platformLabels[platform]}
        </Link>
      </div>
      <span className="badge">Paused</span>
      <p>Activity is hidden and Telegram recaps are paused. Your daily data is still saved.</p>
      <p className="field-help">
        Resume to see your saved history and receive future scheduled recaps.
      </p>
    </section>
  );
}

export function ServiceManagement({
  platform,
  status,
  onChange,
}: {
  platform: FeatureId;
  status: TrackingStatus;
  onChange: (status: TrackingStatus) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registrationId = status.registrationId;
  if (!registrationId || !status.username) return null;
  async function revoke() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestJson<TrackingStatus>(statusPaths[platform], {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, confirmPermanentDeletion: true }),
      });
      onChange(next);
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not revoke this service. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-management">
      <div className="dashboard-actions">
        <ServiceControl
          platform={platform}
          paused={status.paused}
          registrationId={registrationId}
          onChange={onChange}
        />
        <button
          type="button"
          className="text-button danger-text"
          disabled={busy}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Revoke &amp; delete data
        </button>
      </div>
      {open && (
        <ConsentDialog
          title={`Revoke ${platformLabels[platform]}?`}
          acknowledgment="I understand this permanently deletes the saved data and cannot be undone."
          confirmLabel="Revoke & permanently delete"
          busy={busy}
          error={error}
          destructive
          onCancel={() => setOpen(false)}
          onConfirm={() => void revoke()}
        >
          {platform === "daily-grind" ? (
            <p>
              Revoke Daily Grind and delete its Telegram connection, pending links, and delivery
              history. Coding-platform activity, Notes, Articles, sign-in identities, and your
              account are kept. Messages already delivered to Telegram remain there.
            </p>
          ) : (
            <>
              <p>
                Revoke <strong>{platformLabels[platform]}</strong> for{" "}
                <strong className="mono">{status.username}</strong> and permanently delete its saved
                activity, profiles, snapshots, goals, and report history from Track.it.
              </p>
              <p>
                This cannot be undone. Daily collection and recaps stop. Other services and your
                Track.it account are kept.
              </p>
              <p>
                Your public coding-platform profile and Telegram messages already delivered are not
                deleted. A later registration starts fresh.
              </p>
            </>
          )}
        </ConsentDialog>
      )}
    </div>
  );
}
