"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityPlatform } from "@/lib/activity/types";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { platformLabels } from "@/lib/tracking/platforms";

export function ServiceControl({
  platform,
  paused,
  registrationId,
  onChange,
}: {
  platform: ActivityPlatform;
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
      const next = await requestJson<TrackingStatus>(`/api/tracking/services/${platform}`, {
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

export function PausedService({
  platform,
  username,
  registrationId,
}: {
  platform: ActivityPlatform;
  username: string;
  registrationId: string;
}) {
  return (
    <section
      className="activity-panel paused-service"
      aria-label={`${platformLabels[platform]} paused`}
    >
      <div className="activity-heading">
        <h2>
          {platformLabels[platform]} · {username}
        </h2>
        <ServiceControl platform={platform} paused registrationId={registrationId} />
      </div>
      <span className="badge">Paused</span>
      <p>Activity is hidden and Telegram recaps are paused. Your daily data is still saved.</p>
      <p className="field-help">
        Resume to see your saved history and receive future scheduled recaps.
      </p>
    </section>
  );
}
