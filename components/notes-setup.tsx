"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TrackingStatus } from "@/lib/tracking/types";
import { requestJson } from "@/lib/http/client";
import { NOTES_CODE_PATTERN } from "@/lib/notes/validation";
import { ServiceControl } from "./service-control";
import { ConsentDialog } from "./consent-dialog";
import { NotesIconButton, NotesIcon } from "./notes-icons";
import { InfoPopover } from "./info-popover";

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
    <section className="tracking-panel" aria-label="Notes service setup">
      <div className="activity-heading">
        <h2>{status.registrationId ? "Manage Notes" : "Register Notes"}</h2>
        <InfoPopover label="Notes service information">
          Save up to 100 words and 10 links or search phrases per note. Register a case-sensitive
          code using 5–9 letters or digits. Anyone with it can access this notebook for 20 minutes
          while signed out. Website sign-in has no Notes timer.
        </InfoPopover>
      </div>
      {error && !deleting && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="notes-notice" role="status">
        {notice}
      </p>
      <form className="registration-form notes-form" onSubmit={save}>
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
          5–9 letters or digits.
        </p>
        <NotesIconButton
          type="submit"
          icon="save"
          label={status.registrationId ? "Change secret code" : "Register Notes"}
          disabled={busy || !NOTES_CODE_PATTERN.test(code)}
        />
      </form>
      {status.registrationId && (
        <div className="notes-actions">
          <ServiceControl
            platform="notes"
            paused={status.paused}
            registrationId={status.registrationId}
            onChange={setStatus}
          />
          <Link
            className="button secondary icon-button"
            href="/dashboard?service=notes"
            aria-label="Open Notes on Dashboard"
            title="Open Notes on Dashboard"
          >
            <NotesIcon name="notes" />
          </Link>
          <NotesIconButton
            icon="delete"
            label="Revoke Notes and delete data"
            disabled={busy}
            onClick={() => {
              setError("");
              setDeleting(true);
            }}
          />
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
