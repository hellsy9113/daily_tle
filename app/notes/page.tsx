import { SiteShell } from "@/components/site-shell";
import { NotesPanel } from "@/components/notes-panel";
import { serverAccount } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Private notes · Track.it",
};
export default async function NotesPage() {
  if (await serverAccount()) redirect("/dashboard?service=notes");
  return (
    <SiteShell>
      <NotesPanel signedIn={false} />
    </SiteShell>
  );
}
