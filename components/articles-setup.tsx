"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ARTICLE_TOPICS, type ArticleTopic } from "@/lib/articles/topics";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { ServiceControl } from "./service-control";
import { ConsentDialog } from "./consent-dialog";

export function ArticlesSetup({ initialStatus }: { initialStatus: TrackingStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [topics, setTopics] = useState<ArticleTopic[]>(initialStatus.topics ?? []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setStatus(
        await requestJson<TrackingStatus>(
          status.registrationId ? "/api/articles/preferences" : "/api/tracking/services/articles",
          {
            method: status.registrationId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              status.registrationId
                ? { topics, registrationId: status.registrationId }
                : { topics },
            ),
          },
        ),
      );
      setNotice(
        "Topics saved. If today's selection already exists, your new topics apply tomorrow.",
      );
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save topics.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await requestJson<TrackingStatus>("/api/tracking/services/articles", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: status.registrationId,
            confirmPermanentDeletion: true,
          }),
        }),
      );
      setTopics([]);
      setRevoking(false);
      setNotice("Daily Articles revoked. Your preferences and reading history were deleted.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not revoke Daily Articles.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tracking-panel" aria-labelledby="articles-setup-title">
      <div className="panel-heading">
        <p className="eyebrow">
          <span className="badge badge-active">Logged in</span>
        </p>
        <h2 id="articles-setup-title">
          {status.registrationId ? "Manage Daily Articles" : "Register Daily Articles"}
        </h2>
      </div>
      {notice && (
        <p role="status" className="profile-notice">
          {notice}
        </p>
      )}
      {error && !revoking && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form className="registration-form" onSubmit={save} aria-busy={busy}>
        <fieldset className="article-topic-picker" disabled={busy}>
          <legend>Choose 1–2 topics</legend>
          {ARTICLE_TOPICS.map((topic) => (
            <label className="checkbox-label" key={topic.id}>
              <input
                type="checkbox"
                checked={topics.includes(topic.id)}
                disabled={!topics.includes(topic.id) && topics.length >= 2}
                onChange={(event) =>
                  setTopics((current) =>
                    event.target.checked
                      ? [...current, topic.id]
                      : current.filter((id) => id !== topic.id),
                  )
                }
              />
              {topic.label}
            </label>
          ))}
        </fieldset>
        <p className="field-help">
          Up to 6 articles at a time, using Asia/Kolkata boundaries. Availability may mean fewer
          articles. Topics change tomorrow’s selection. The first Refresh each day fills empty
          slots; later refreshes show different unseen articles from the catalog.
        </p>
        <button
          className="button primary"
          disabled={busy || topics.length < 1 || topics.length > 2}
        >
          {busy ? "Saving…" : status.registrationId ? "Save topics" : "Register Daily Articles"}
        </button>
      </form>
      {status.registrationId && (
        <div className="service-management articles-management">
          <div className="articles-service-state">
            <div>
              <h3>Reading service</h3>
              <p className="field-help">
                {status.paused
                  ? "Paused · resume to access your reading list."
                  : "Active · your daily reading list is available on Dashboard."}
              </p>
            </div>
            <ServiceControl
              platform="articles"
              paused={status.paused}
              registrationId={status.registrationId}
              onChange={setStatus}
            />
          </div>
          <div className="articles-management-footer">
            <button
              className="text-button danger-text"
              disabled={busy}
              onClick={() => {
                setError("");
                setRevoking(true);
              }}
            >
              Revoke &amp; delete data
            </button>
          </div>
        </div>
      )}
      {revoking && (
        <ConsentDialog
          title="Revoke Daily Articles?"
          acknowledgment="I understand my topic preferences and feed history will be permanently deleted."
          confirmLabel="Revoke & permanently delete"
          destructive
          busy={busy}
          error={error}
          onCancel={() => setRevoking(false)}
          onConfirm={() => void revoke()}
        >
          <p>
            Your account&apos;s preferences, daily selections, and seen-article history will be
            deleted. Shared articles and other services are preserved.
          </p>
        </ConsentDialog>
      )}
    </section>
  );
}
