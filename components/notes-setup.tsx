"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { NOTES_CODE_PATTERN } from "@/lib/notes/validation";
import { ServiceControl } from "./service-control";
import { ConsentDialog } from "./consent-dialog";
import { NotesIconButton } from "./notes-icons";

export function NotesSetup({ initialStatus }: { initialStatus: TrackingStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (status.registrationId) {
        await requestJson("/api/notes/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, registrationId: status.registrationId }),
        });
        setNotice("Secret code changed. Previous code sessions have been locked.");
      } else {
        setStatus(
          await requestJson<TrackingStatus>("/api/tracking/services/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          }),
        );
        setNotice("Notes registered. Your notebook is available on Dashboard.");
      }
      setCode("");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save Notes settings.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await requestJson<TrackingStatus>("/api/tracking/services/notes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: status.registrationId,
            confirmPermanentDeletion: true,
          }),
        }),
      );
      setDeleting(false);
      setNotice("Notes revoked and saved notes deleted.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not revoke Notes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tracking-panel" aria-labelledby="notes-setup-title">
      <div className="panel-heading">
        <p className="eyebrow">
          <span className="badge badge-active">Logged in</span>
        </p>
        <h2 id="notes-setup-title">{status.registrationId ? "Manage Notes" : "Register Notes"}</h2>
      </div>
      {notice && (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      )}
      {error && !deleting && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {status.registrationId ? (
        <>
          <p className="tracking-note">
            <span className={`badge ${status.paused ? "" : "badge-active"}`}>
              {status.paused ? "Service paused" : "Service enabled"}
            </span>{" "}
            {status.paused
              ? "Your saved notes are kept. Resume Notes to open your notebook."
              : "Open Dashboard to view your private notebook."}
          </p>
          <dl className="account-details">
            <div>
              <dt>Notebook</dt>
              <dd>{status.username}</dd>
            </div>
            <div>
              <dt>Note limits</dt>
              <dd>100 words and 10 links or search phrases per note</dd>
            </div>
            <div>
              <dt>Code access</dt>
              <dd>20-minute sessions when signed out</dd>
            </div>
          </dl>
          <div className="service-management">
            <div className="dashboard-actions">
              <ServiceControl
                platform="notes"
                paused={status.paused}
                registrationId={status.registrationId}
                onChange={setStatus}
              />
              <button
                type="button"
                className="text-button danger-text"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setDeleting(true);
                }}
              >
                Revoke &amp; delete data
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="muted">
          Save short thoughts and useful links in a private notebook. Choose a secret code to
          register Notes and unlock it while signed out.
        </p>
      )}
      <form
        className={`registration-form notes-form${status.registrationId ? " connect-area" : ""}`}
        onSubmit={save}
        aria-busy={busy}
      >
        <label htmlFor="notes-service-code">
          {status.registrationId ? "New secret code" : "Secret code"}
        </label>
        <div className="notes-code-row">
          <input
            id="notes-service-code"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            minLength={5}
            maxLength={9}
            pattern="[A-Za-z0-9]{5,9}"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            aria-describedby="notes-service-code-help"
          />
          <NotesIconButton
            icon="key"
            label={visible ? "Hide code" : "Show code"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          />
        </div>
        <p id="notes-service-code-help" className="field-help">
          Use 5–9 case-sensitive letters or digits. Anyone with this code can access your notebook
          for 20 minutes while signed out.
          {status.registrationId && " Changing it locks all previous code sessions."}
        </p>
        <button
          type="submit"
          className="button primary full-width"
          disabled={busy || !NOTES_CODE_PATTERN.test(code)}
        >
          {busy ? "Saving…" : status.registrationId ? "Change secret code" : "Register Notes"}
        </button>
      </form>
      {status.registrationId && (
        <div className="tracking-note">
          <Link className="button secondary full-width" href="/dashboard?service=notes">
            Open Notes on Dashboard <span aria-hidden="true">→</span>
          </Link>
          <p className="field-help">Website sign-in has no Notes timer.</p>
        </div>
      )}
      {deleting && (
        <ConsentDialog
          title="Revoke Notes?"
          acknowledgment="I understand this permanently deletes my notes and links."
          confirmLabel="Revoke & permanently delete"
          destructive
          busy={busy}
          error={error}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void revoke()}
        >
          <p>
            This deletes all notes and links and disables code access. Other services remain
            available.
          </p>
        </ConsentDialog>
      )}
    </section>
  );
}
