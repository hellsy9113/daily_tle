import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ProfilePanel } from "@/components/profile-panel";
import { serverAccount } from "@/lib/auth/session";
import { profileSummary } from "@/lib/profile";

export const metadata = { title: "Profile & settings · Track.it" };
export default async function ProfilePage() {
  const account = await serverAccount();
  if (!account) redirect("/feature");
  return (
    <SiteShell signedIn>
      <ProfilePanel initialProfile={await profileSummary(account)} />
    </SiteShell>
  );
}
