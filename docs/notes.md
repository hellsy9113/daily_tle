# Private notes

The **Notes** navigation link opens `/notes` for everyone. Signed-in website users
can create, edit, and delete private notes immediately, including accounts with no
coding-platform registrations. Each note supports **100 words of text** and up to
**10 HTTP/HTTPS links**, stored separately from the word limit. Notes can also
contain links without text. The server enforces these limits and account ownership.

Apply `0007_notes.sql` with `npm run db:migrate` before using this feature. No new
external service or credentials are needed.

While signed in, open **Code access** on the Notes page to register a single secret
access code. Choose a case-sensitive code of 20–128 characters or use **Generate
code** for a random 192-bit code. Save it securely: anyone with the code can read,
edit, or delete that notebook's notes. The server stores a one-way scrypt derivation,
not the original code. Codes must be unique across notebooks.

Visitors who are not signed in can enter their registered code on `/notes`. This
creates a separate HttpOnly, SameSite cookie and server-side session that expires
**20 minutes after login**, without extending on activity. The interface clears
private content and unsaved drafts on expiry; server-side checks reject expired
sessions even if a browser retains the cookie. **Lock notes** ends the session early.
This session grants access to Notes only. It does not sign the visitor into Telegram,
Dashboard, Profile, or other account features.

Normal website sign-in always takes priority and has no 20-minute notes timer.
Only a signed-in website account can register, replace, or disable its code.
Replacing or disabling it revokes all code sessions while preserving saved notes.
A forgotten code can be replaced after website sign-in. Website sign-out also
locks any code session in the same browser.

Code authentication is limited to 10 attempts per 15 minutes per client address,
stored in PostgreSQL so the limit survives process restarts. At deployment, the
trusted ingress must overwrite `X-Forwarded-For` rather than accepting arbitrary
client-supplied values. Without that header, requests share an anonymous limit.
Codes are accepted only in JSON request bodies, never in URLs.

| Method | Endpoint              | Behavior                                                                                         |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/api/notes?offset=0` | List private notes, 50 at a time; returns `nextOffset`, access type, and fixed guest `expiresAt` |
| POST   | `/api/notes`          | Create `{ "text": "...", "links": ["https://..."] }`                                             |
| PATCH  | `/api/notes/[id]`     | Replace the text and links of an owned note                                                      |
| DELETE | `/api/notes/[id]`     | Delete an owned note                                                                             |
| POST   | `/api/notes/access`   | Signed-in account registers/replaces `{ "code": "..." }`                                         |
| DELETE | `/api/notes/access`   | Signed-in account disables code access and revokes guest sessions                                |
| POST   | `/api/notes/session`  | Signed-out visitor unlocks notes with `{ "code": "..." }` for 20 minutes                         |
| DELETE | `/api/notes/session`  | Lock the current code session                                                                    |

Mutations require the canonical same-origin `Origin` header. Private API responses
use `Cache-Control: no-store`. Foreign notebook IDs and ownership fields are never
accepted from the client. Unit/UI tests run under `npm test`; `npm run test:db`
also exercises notes ownership, real sessions, fixed expiry, revocation, and throttling.
