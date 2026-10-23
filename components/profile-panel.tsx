"use client";

import Link from "next/link";
import { ConsentDialog } from "./consent-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileSummary } from "@/lib/profile";
import { featurePaths, platformLabels } from "@/lib/features/catalog";
import { requestJson } from "@/lib/http/client";

export function ProfilePanel({ initialProfile }: { initialProfile: ProfileSummary }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [themeBusy, setThemeBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  async function removeAccount() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await requestJson("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPermanentDeletion: true }),
      });
      router.replace("/");
      router.refresh();
    } catch (failure) {
      setDeleteError(
        failure instanceof Error ? failure.message : "Could not delete your account. Try again.",
      );
      setDeleteBusy(false);
    }
  }
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
  return (
    <div className="profile-layout">
      <div>
        <p className="eyebrow">Your account</p>
        <h1>Profile &amp; settings</h1>
        <p className="lead">Manage your account, appearance, and services.</p>
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
            <dd className="mono">{profile.telegramId ?? "Not linked"}</dd>
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
            <dt>Google account</dt>
            <dd>
              {profile.googleLinked ? (
                (profile.googleEmail ?? "Linked")
              ) : (
                <a className="text-button" href="/api/auth/google/login?link=1">
                  Link Google sign-in
                </a>
              )}
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
        <p className="field-help">Manage services in Feature.</p>
        <table>
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col">Username</th>
              <th scope="col">Status</th>
              <th scope="col">Manage service</th>
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
                  <Link className="text-button" href={featurePaths[service.platform]}>
                    {service.username ? "Manage service" : "Enable service"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="tracking-panel" aria-labelledby="delete-account-title">
        <h2 id="delete-account-title">Delete account</h2>
        <p className="field-help">Permanently delete your account and all saved data.</p>
        <button
          className="button danger"
          onClick={() => {
            setDeleteError("");
            setDeleting(true);
          }}
        >
          Delete account
        </button>
      </section>
      {deleting && (
        <ConsentDialog
          title="Delete your account?"
          acknowledgment="I understand this permanently deletes my account and saved data."
          confirmLabel="Permanently delete account"
          destructive
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void removeAccount()}
        >
          <p>
            Your activity, notes, article preferences, and sessions will be deleted. Telegram recaps
            will stop. This cannot be undone.
          </p>
          <p>
            Your coding-platform accounts and messages already delivered to Telegram are unaffected.
          </p>
        </ConsentDialog>
      )}
    </div>
  );
}
