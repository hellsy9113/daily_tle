# Private notes

## Register and manage

Sign in to the website, choose **Notes** on **Feature**, and register a secret code.
Codes are case-sensitive and contain **5–9 letters or digits** (`A–Z`, `a–z`, `0–9`).
No extra character-mix rule applies. Each code identifies one private notebook and
must be available. The server stores a one-way scrypt derivation, never the code.

Registration is required before signed-in or code-based access. Notes is independent
of coding-platform registrations and Telegram recap setup. It appears in the
**Dashboard service navigation**, with the same Feature → Manage service flow as
other services. There is no Notes link in the global navigation bar.

**Manage service** on Feature lets the owner change the code, pause/resume Notes,
or revoke the service and permanently delete its notes and links. Code changes
revoke existing code sessions while preserving notes. Pause revokes code sessions
and blocks reading/writing until resume; it preserves saved content. Revocation
removes the notebook and its sessions, leaving other services and website sign-in
intact. Re-registration creates a new notebook identity; stale requests cannot
manage or write to it. Forgotten codes can be replaced after website sign-in.

## Notes interface

The Dashboard Notes view has a compact toolbar with labelled icon buttons. **Add**
opens a modal editor; **Edit** uses the same dialog. Inputs are not displayed in the
page until requested. Save/close/delete/refresh/lock controls have accessible names
and tooltips. Help and descriptions appear in information popovers on hover,
focus, or click. Dialogs support Escape, focus trapping through native `dialog`,
and focus return. Deletion requires confirmation.

Each note supports **100 words of text** plus up to **10 links or search phrases**,
counted separately. Domain entries such as `example.com/path` open as HTTPS links;
full HTTP/HTTPS links remain supported. Plain phrases open a Google search.
All links open in a new tab with `noopener noreferrer` and no referrer. No link
content is fetched by the server. Executable schemes and credential-bearing URLs
are rejected. Only trimmed labels are stored; targets are derived safely at render.

## Code access

Signed-out visitors can open `/notes` and enter their registered code. Access is
limited to Notes for a fixed **20 minutes**, without extending on activity. The
separate server session and HttpOnly, SameSite cookie do not grant access to other
features. The page clears saved content and unsaved drafts on expiry; the server
also rejects expired tokens. The lock icon ends access early.

Signed-in visitors go directly to the Dashboard Notes view without entering the
code or using the 20-minute timer, after registering the service. Website sign-out
also locks any Notes code session in that browser. Anyone who knows the code can
read, edit, and delete the notebook's notes; keep it private.

Authentication is limited to 10 attempts per 15 minutes per client address in
PostgreSQL. Trusted deployment ingress must overwrite `X-Forwarded-For` rather
than accept client-supplied addresses; missing addresses share an anonymous bucket.
Codes travel only in JSON bodies, never URLs. All mutations check Origin and all
private responses use `Cache-Control: no-store`. Account locks precede notebook
locks for registration, management, authentication, and note writes.

## API

| Method | Endpoint                       | Behavior                                                                     |
| ------ | ------------------------------ | ---------------------------------------------------------------------------- |
| GET    | `/api/tracking/services/notes` | Read account-owned registration/paused status                                |
| POST   | `/api/tracking/services/notes` | Register with `{ "code": "Note123" }`                                        |
| PATCH  | `/api/tracking/services/notes` | Pause/resume with `{ "registrationId": "UUID", "paused": true }`             |
| DELETE | `/api/tracking/services/notes` | Revoke with `{ "registrationId": "UUID", "confirmPermanentDeletion": true }` |
| POST   | `/api/notes/access`            | Change code with `{ "registrationId": "UUID", "code": "Next456" }`           |
| GET    | `/api/notes?offset=0`          | Paginated notes, access type, and fixed guest expiry                         |
| POST   | `/api/notes`                   | Create `{ "text": "...", "links": ["example.com", "search phrase"] }`        |
| PATCH  | `/api/notes/[id]`              | Update an owned note                                                         |
| DELETE | `/api/notes/[id]`              | Delete an owned note                                                         |
| POST   | `/api/notes/session`           | Unlock using `{ "code": "Note123" }`                                         |
| DELETE | `/api/notes/session`           | Lock the current code session                                                |

The old DELETE `/api/notes/access` operation no longer disables the required code;
it returns 405 for signed-in accounts. Use service pause or revocation instead.

## Migration and validation

Apply `0009_notes_service.sql` with `npm run db:migrate` before deployment. It adds
Notes registration state and pause state, and clears existing code sessions.
**Existing saved notes are retained**: owners register a new 5–9 character code
on Feature to reopen them. Existing longer codes are replaced during registration.
Migrations `0007_notes.sql` and `0008_weekly_recaps.sql` remain unchanged.

Run `npm run check`, `npm run build`, and `npm run test:db`. Coverage includes code
boundaries, service registration, migration-compatible preserved notes, ownership,
code rotation, expiry, pause/resume, permanent deletion, and stale generations.
