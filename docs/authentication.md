# Website sign-in and Daily Grind

Website sign-in supports Google and Telegram. Sign-in creates an account and a private
session, without enabling Daily Grind or registering any coding platform. Notes and
Articles remain independent features. Coding-platform registration requires the
website URL, database, and `TRACKING_REGISTRATION_ENABLED=true`; Telegram configuration
is required only for Telegram sign-in and the Daily Grind delivery feature.

## Google OAuth configuration

Create a **Web application** OAuth client in Google Cloud, configure its consent screen,
and add the exact authorized redirect URIs for the environments you use:

- Production: `https://daily-tle-ruby.vercel.app/api/auth/google/callback`
- Local development: `http://localhost:3000/api/auth/google/callback`

For another deployment, use `${APP_URL}/api/auth/google/callback`. `APP_URL` must be the
canonical HTTPS origin in production. Register preview domains separately if needed.
For **Authorized JavaScript origins**, use `https://daily-tle-ruby.vercel.app` and
`http://localhost:3000`, without a path. Authentication uses the server callback;
JavaScript origins do not replace the authorized redirect URI.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the server environment; never use
`NEXT_PUBLIC_` for the secret. Restart development or redeploy after configuring them.
If the consent screen is in testing mode, add the intended Google users as test users.

The application uses the existing `openid-client` library's authorization code flow
with PKCE, state, nonce, issuer/audience/expiry validation, and signature verification.
Google sign-in requests `openid email profile`, stores the stable Google `sub` plus
verified email, and discards provider tokens. Email is display metadata, never an
account merge key. Login attempts are hashed, expire after ten minutes, and are consumed
once. Sessions use the existing hashed, HttpOnly, SameSite=Lax cookie flow.
See [Google's OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect).

## Existing accounts and linking

Existing Telegram sign-in continues to open the same account. To add Google access
without creating another account, sign in with Telegram first and choose **Link Google
sign-in** in Profile. The attempt records the account and initiating session hash;
the callback requires that same unexpired session and never switches accounts.
A Google identity already used by another account cannot be linked. Accounts are never
automatically merged. A failed link returns to Profile with a generic error.

A new Google account can enable Daily Grind and use a one-time personal Telegram
link to bind its Telegram identity. A Telegram identity belonging to another Track.it
account is rejected without consuming the link. Sign in with that existing Telegram
account and link Google from its Profile instead. Telegram identities remain fixed
once bound, including after Daily Grind is revoked, so existing sign-in access is kept.

## Daily Grind lifecycle

Daily Grind is a separate Feature card at `/feature?platform=daily-grind`. Enabling
requires an unchecked delivery-consent acknowledgment. Its registration has its own
UUID generation, acceptance version, and registration timestamp. It does not require
a coding platform at registration; recaps become useful when at least one platform
is enabled. The personal bot link expires after fifteen minutes, is stored as a hash,
and is fenced to the current Daily Grind generation. Creating another link invalidates
the old one. Connections can only be made while the feature is enabled and unpaused.

Pause cancels unsent deliveries and marks existing collection jobs ineligible for
recaps. Ordinary platform collection and dashboard access continue. `/start` cannot
bypass a website pause. Resume permits future eligible reports without replaying
cancelled ones. Telegram `/stop`, `/start`, and blocked-bot status remain independent
of the website pause flag. Dispatch checks both feature eligibility and the platform
generation under the account lock immediately before sending each part.

Revoking Daily Grind deletes its personal links and delivery history, clears the chat
connection and Daily Grind generation, and cancels recap eligibility. It preserves
coding-platform registrations, collected activity, Notes, Articles, login identities,
sessions, and the small shared reminder ledger that prevents duplicate reminders.
Already delivered Telegram messages remain in Telegram. Re-enabling creates a new
generation and requires fresh consent and a fresh connection link.

## Deployment and verification

Apply `0015_google_and_daily_grind.sql` before deploying this code. It makes Telegram
identity optional for Google accounts, adds Google identity and one-time login attempts,
and adds the independent Daily Grind lifecycle and generation-fenced connection tokens.
Existing connected Telegram accounts are backfilled as opted in. Accounts that have
never connected remain opted out; old pending links for those accounts are invalidated.
Legacy connections keep their existing connection timestamp and delivery state; no
agreement acceptance is fabricated for them. New enrollments store agreement version 1.

No production migration is applied during development. Run `npm run check`,
`npm run build`, and `npm run test:db` against isolated PostgreSQL before release.
