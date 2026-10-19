import { SiteShell } from "@/components/site-shell";
import { NotesPanel } from "@/components/notes-panel";
import { serverAccount } from "@/lib/auth/session";

export const metadata = { title: "Private notes · Track.it" };

export default async function NotesPage() {
  const account = await serverAccount();
  return (
    <SiteShell signedIn={Boolean(account)}>
      <div className="feature-heading">
        <p className="eyebrow">A little space to think</p>
        <h1>Your notes, kept together.</h1>
        <p className="lead">
          Save a thought and the links that go with it. Up to 100 words per note.
        </p>
      </div>
      <NotesPanel signedIn={Boolean(account)} />
    </SiteShell>
  );
}
