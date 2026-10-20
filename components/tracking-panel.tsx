"use client";

import { ConsentDialog } from "./consent-dialog";
import { ServiceManagement } from "./service-control";
import { AGREEMENT_VERSION, agreementClauses } from "@/lib/tracking/agreement";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import type { FeatureId } from "@/lib/features/catalog";
import { platformLabels, statusPaths } from "@/lib/features/catalog";

export function TrackingPanel({
  initialStatus,
  platform = "leetcode",
}: {
  initialStatus: TrackingStatus;
  platform?: FeatureId;
}) {
  const platformLabel = platformLabels[platform];
  const statusPath = statusPaths[platform];
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [username, setUsername] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (status.username && !initialStatus.username) heading.current?.focus();
  }, [status.username, initialStatus.username]);

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
        setNotice("");
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
      {notice && (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status.username
          ? `${platformLabel} tracking is enabled. Username ${status.username} is fixed until you revoke this service.`
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
          {status.paused && (
            <p className="field-help">
              Daily data is still saved. Resume this service to view activity and allow future
              recaps if Daily Grind is enabled.
            </p>
          )}
          <dl className="account-details">
            <div>
              <dt>{platformLabel} username</dt>
              <dd>
                <span className="mono">{status.username}</span>
                {platform === "leetcode" && <span className="badge">Locked</span>}
              </dd>
            </div>
          </dl>
          <ServiceManagement
            platform={platform}
            status={status}
            onChange={(next) => {
              setStatus(next);
              if (!next.username) {
                setUsername("");
                setError("");
                setNotice(
                  `${platformLabel} revoked. Its saved Track.it data was permanently deleted.`,
                );
              }
            }}
          />
          <p className="field-help">
            Telegram recaps are optional.{" "}
            <Link href="/feature?platform=daily-grind">Manage Daily Grind</Link>
          </p>
        </>
      )}
    </section>
  );
}
