"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileSummary } from "@/lib/profile";
import type { TrackingStatus } from "@/lib/tracking/types";
import { featurePaths, platformLabels } from "@/lib/tracking/platforms";
import { requestJson } from "@/lib/http/client";
import { ConsentDialog } from "./consent-dialog";

export function ProfilePanel({ initialProfile }: { initialProfile: ProfileSummary }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [selected, setSelected] = useState<ProfileSummary["services"][number] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  async function changeTheme(theme: "light" | "dark") {
    if (themeBusy) return;
    setThemeBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      document.documentElement.setAttribute("data-theme", theme);
      setProfile((current) => ({ ...current, theme }));
      setNotice(`${theme === "dark" ? "Dark" : "Light"} mode saved to your account.`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your theme.");
    } finally {
      setThemeBusy(false);
    }
  }
  async function revoke() {
    if (!selected || deleting) return;
    setDeleting(true);
    setDeleteError("");
    setNotice("");
    try {
      const status = await requestJson<TrackingStatus>(
        `/api/tracking/services/${selected.platform}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: selected.registrationId,
            confirmPermanentDeletion: true,
          }),
        },
      );
      setProfile((current) => ({
        ...current,
        services: current.services.map((service) =>
          service.platform === selected.platform
            ? { platform: service.platform, ...status }
            : service,
        ),
      }));
      setNotice(
        `${platformLabels[selected.platform]} revoked. Its saved Track.it data was permanently deleted.`,
      );
      setSelected(null);
      router.refresh();
    } catch (failure) {
      setDeleteError(
        failure instanceof Error ? failure.message : "Could not revoke this service. Try again.",
      );
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="profile-layout">
      <div>
        <p className="eyebrow">Your account</p>
        <h1>Profile &amp; settings</h1>
        <p className="lead">Manage your appearance, connected services, and saved data.</p>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      )}
      <section className="tracking-panel" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title">Account details</h2>
        <dl className="account-details">
          <div>
            <dt>Telegram ID</dt>
            <dd className="mono">{profile.telegramId}</dd>
          </div>
          <div>
            <dt>Account created</dt>
            <dd>
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeZone: "Asia/Kolkata",
              }).format(new Date(profile.createdAt))}
            </dd>
          </div>
          <div>
            <dt>Daily Grind connection</dt>
            <dd>{profile.connected ? "Connected" : "Not connected"}</dd>
          </div>
          <div>
            <dt>Telegram recaps</dt>
            <dd>
              {profile.status === "active"
                ? "Active"
                : profile.status === "blocked"
                  ? "Bot blocked"
                  : profile.status === "paused"
                    ? "Paused in Telegram"
                    : "Awaiting connection"}
            </dd>
          </div>
        </dl>
        <form action="/api/auth/logout" method="post">
          <button className="button secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>
      <section className="tracking-panel" aria-labelledby="profile-appearance-title">
        <h2 id="profile-appearance-title">Appearance</h2>
        <p className="field-help">
          {profile.theme
            ? "Your choice follows your account across devices."
            : "Following your device theme until you choose a mode."}
        </p>
        <div className="theme-options" role="group" aria-label="Color theme">
          {(["light", "dark"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`button ${profile.theme === theme ? "primary" : "secondary"}`}
              aria-pressed={profile.theme === theme}
              disabled={themeBusy}
              onClick={() => void changeTheme(theme)}
            >
              {theme === "light" ? "Light mode" : "Dark mode"}
            </button>
          ))}
        </div>
      </section>
      <section className="tracking-panel profile-services" aria-labelledby="profile-services-title">
        <h2 id="profile-services-title">Services &amp; data</h2>
        <p className="field-help">
          Revoking a service also permanently deletes its saved data. You can register again later
          and start fresh.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col">Username</th>
              <th scope="col">Status</th>
              <th scope="col">Revoke &amp; delete data</th>
            </tr>
          </thead>
          <tbody>
            {profile.services.map((service) => (
              <tr key={service.platform}>
                <th scope="row">{platformLabels[service.platform]}</th>
                <td data-label="Username">
                  <span className="mono">{service.username ?? "—"}</span>
                </td>
                <td data-label="Status">
                  <span
                    className={`badge ${service.username && !service.paused ? "badge-active" : ""}`}
                  >
                    {!service.username ? "Not enabled" : service.paused ? "Paused" : "Enabled"}
                  </span>
                </td>
                <td data-label="Manage service">
                  {service.username && service.registrationId ? (
                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={() => {
                        setDeleteError("");
                        setSelected(service);
                      }}
                    >
                      Revoke &amp; delete data
                    </button>
                  ) : (
                    <Link href={featurePaths[service.platform]}>Enable service →</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (
        <ConsentDialog
          title={`Revoke ${platformLabels[selected.platform]}?`}
          acknowledgment="I understand this permanently deletes the saved data and cannot be undone."
          confirmLabel="Revoke & permanently delete"
          busy={deleting}
          error={deleteError}
          destructive
          onCancel={() => setSelected(null)}
          onConfirm={() => void revoke()}
        >
          <p>
            Revoke <strong>{platformLabels[selected.platform]}</strong> for{" "}
            <strong className="mono">{selected.username}</strong> and permanently delete its saved
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
        </ConsentDialog>
      )}
    </div>
  );
}
