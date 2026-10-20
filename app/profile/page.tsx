import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ProfilePanel } from "@/components/profile-panel";
import { serverAccount } from "@/lib/auth/session";
import { profileSummary } from "@/lib/profile";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Profile & settings · Track.it",
};
export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const error = (await searchParams)?.error;
  const account = await serverAccount();
  if (!account) redirect("/feature");
  return (
    <SiteShell signedIn>
      {error === "google-login" && (
        <p className="inline-error" role="alert">
          Google sign-in could not be linked. Try again from this signed-in account; a Google
          identity already used by another account cannot be linked here.
        </p>
      )}
      <ProfilePanel initialProfile={await profileSummary(account)} />
    </SiteShell>
  );
}
