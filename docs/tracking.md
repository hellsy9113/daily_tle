# Tracking setup and behavior

## Daily tracking setup

Users sign in with Google or Telegram and land on `/feature` to choose LeetCode,
GeeksforGeeks, HackerRank, or Codeforces. Each service is enabled independently by registering
one public username that stays fixed until revocation. Registration makes that service's dashboard panel
available immediately; no other service is enabled automatically. The public
navigation shows **Sign in**; **Feature**, **Dashboard**, and **Profile** appear after sign-in. Sign out is on Profile.

Enable the optional **Daily Grind** service on Feature, then connect through a personal Telegram link and tap **Start** to
receive recaps for all enabled services. Yesterday's available problems arrive at
**8:30–9:30 a.m. Asia/Kolkata**. Failed or interrupted reports are retried during
**9:30–10:30 a.m.** Daily commands are unnecessary; `/stop` pauses delivery and
`/start` resumes the same account. Delivery status is separate from service
registration: pending, paused, or blocked delivery does not hide registered activity.

### India timezone and nightly collection

All activity days, calendars, displayed timestamps, and Telegram recaps use
**Asia/Kolkata (India Standard Time)**. Profile has no timezone selector.

The nightly collection-only job runs at **10:45 p.m. IST** (`15 17 * * *` UTC),
even when the dashboard is closed. It checks all registered coding platforms,
including paused services, using the existing sync leases and generation checks.
It saves activity without sending notifications. Problems solved after the check
or delayed upstream can still be detected later.

Daily notifications remain at **8:30 a.m. IST**, with recovery at **9:30 a.m. IST**.
Sunday weekly recaps remain at **11:00 p.m. IST**, with recovery at **11:30 p.m. IST**.
Each cron runs at most once daily; there is no 15-minute scheduler. Hosting can
delay an invocation, so the configured time is not an exact delivery guarantee.

Keep migration `0010_account_timezone.sql` in the migration history for deployments
that already applied it. Apply `0011_fixed_india_timezone.sql` before deploying this
change to reset obsolete preferences to India. Existing observation and report
metadata remain intact; activity reads group saved instants into India calendar days.

Returning from Telegram checks the connection automatically; the manual check
remains available on the selected service page. Signed-in homepage visitors are
redirected to `/dashboard`; accounts without a registered service are sent to
`/feature`. The legacy `/tracking` page redirects to `/feature?platform=leetcode`.

The public homepage introduces LeetCode, GFG, HackerRank, and Codeforces tracking, with an
illustrative calendar, Telegram recap, features, and a setup guide. A live demo directly below
the hero accepts a public LeetCode username without sign-in and displays unique
recently Accepted problems as linked cards. It calls
`GET /api/user/recent-solved/[username]` and never registers the username. Results
are sorted newest-first and deduplicated by problem slug, using up to 20 public
Accepted submissions; the feed is not a lifetime solved inventory. Loading, empty,
error, retry, and cancelled-request states are handled without losing prior results.

The demo links to the original query bot, `https://t.me/todo1245bot`. Set the optional
server-side `TELEGRAM_BOT_USERNAME` to override that public link for another deployment;
no bot token is exposed to the browser. This bot answers on demand and is separate
from the Daily Grind delivery connection.

### Sunday weekly recaps

In addition to daily recaps, registered LeetCode, GeeksforGeeks, HackerRank, and Codeforces
services receive a weekly Telegram recap scheduled for **Sunday at 11:00 p.m.
Asia/Kolkata**, with recovery at **11:30 p.m.** The Vercel UTC schedules are
`30 17 * * 0` and `0 18 * * 0`. Actual invocation precision depends on the hosting
plan. Weekly handlers skip requests before the cutoff or outside Sunday in IST.

The report covers the **current Monday at 00:00 through Sunday at 23:00 IST**.
It is a week-to-date recap: Sunday's final hour is excluded because it has not
finished at send time. Messages identify the cutoff; recovery always reuses the
same saved boundaries. The public `lastweek` API and query-bot command retain
their previous completed Monday–Sunday meaning.

Each registered, unpaused platform gets its own weekly report using available
public/saved history. LeetCode deduplicates Accepted problem slugs across the
period and warns that its recent public feed can omit earlier solves. HackerRank
uses saved and current public solve timestamps. GFG distinguishes verified
timestamps from newly observed problems, excludes the initial import from
observation counts, and does not invent solve dates. Empty weekly reports describe
the available evidence; they do not use the daily empty-day reminder.

Codeforces uses official Accepted submission timestamps, deduplicating each
problem within the report period. Re-solving on another day remains visible on
that day's calendar. Bounded submission imports can omit older activity; the
calendar and recaps disclose that limitation. It uses the same Daily Grind bot,
account-wide `/stop` and `/start`, and per-service pause and revocation controls.
Apply `0012_codeforces_tracking.sql` before deploying Codeforces support.

Weekly delivery shares the existing tracking bot, `CRON_SECRET`, account stop/start,
platform pause/revocation, message pacing, registration-generation fencing, leases,
prepared message parts, and retry limits. Paused/stopped registrations are recorded
as cancelled for that week and do not replay after resume. Connections/registrations
after the Sunday cutoff start with the following week's recap. A missed primary
invocation can be prepared by Sunday recovery. Duplicate cron invocations do not
resend completed reports, subject to the same Telegram-acceptance crash window as
daily delivery. A shared dispatcher lock prevents concurrent daily/weekly sends.

Apply **`0008_weekly_recaps.sql` with the deployment**, before the updated cron
handlers execute. It adds a `daily`/`weekly` delivery cadence and extends the unique
delivery key so the two report types cannot collide. Existing rows remain `daily`.
Daily collection, empty-day reminders, and dashboard delivery status continue to
use daily records only. Weekly results do not overwrite daily calendar coverage.
Weekly retries are confined to Sunday; unfinished older weekly deliveries close
when the next weekly period is prepared. No additional bot credentials are needed.

### Service management and permanent deletion

Apply `0006_profile_and_services.sql` with `npm run db:migrate` **before deploying this update**.
It adds the account theme, per-platform registration generations and consent metadata, and a
separate durable daily-collection queue. Existing registrations start unpaused, with no
fabricated agreement acceptance. Username replacement is still forbidden; explicit revocation
clears both the username and its registration timestamp. Removing the last platform keeps
the Telegram account, bot connection, and sessions.

`/profile` shows account details, Light/Dark controls, service status, and Sign out.
Each service links to its Feature page for registration, Pause/Resume, and
**Revoke & delete data**. The theme is saved to the account
and rendered on the root HTML before hydration; until a choice is saved, device colors apply.

Daily Grind has its own Feature registration, pause, and revoke controls. Website tracking
works without the bot. Existing connected accounts stay opted in. Google OAuth and
identity linking are documented in [authentication](authentication.md).

The selected Feature page has Pause/Resume controls. Dashboard headers and paused
placeholders link to that page. Pausing hides
that platform's dashboard behind a placeholder and cancels its unsent recaps; daily data
continues saving. Resume reveals the retained history and restores future scheduled recaps,
without replaying missed reports. Telegram `/stop` and `/start` remain account-wide delivery
controls and do not change the individual platform pause choices.

Registration first opens an agreement identifying the platform and username. Acceptance
covers using only your own profile, private data storage, service providers and Telegram,
public-history limitations, continued collection while paused, and permanent deletion on
revocation. No registration request is made until the unchecked acknowledgment is accepted.
All registration POST routes now require:

```json
{ "username": "your_username", "agreementVersion": "1", "acceptedAgreement": true }
```

The revocation dialog separately requires acknowledgment that saved Track.it platform data
will be permanently deleted. Coding-platform profiles and previously delivered Telegram
messages are outside this deletion. The server transaction deletes saved problems, coverage,
snapshots, sync state, goals, deliveries, collection jobs, and platform consent metadata.
Other platforms remain intact; re-registering creates a fresh generation and requires consent.
A platform-free account/day reminder ledger prevents repeat shared reminders after a
platform is paused or revoked. Account-row locks and generation/lease checks fence late
sync results, report sends, and stale browser mutations. Pausing or revoking waits for any already-started report part to finish.

| Method   | Endpoint                            | Behavior                                                                                                   |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET/POST | `/api/tracking/services/[platform]` | Read service status / register with consent; existing platform registration URLs remain aliases            |
| GET      | `/api/profile`                      | Session-owned account details, theme and registered service statuses                                       |
| PATCH    | `/api/profile`                      | Save `{ "theme": "light" }` or `{ "theme": "dark" }`                                                       |
| PATCH    | `/api/tracking/services/[platform]` | Set `{ "registrationId": "current UUID", "paused": true }`; use `false` to resume                          |
| DELETE   | `/api/tracking/services/[platform]` | Atomically revoke and delete with `{ "registrationId": "current UUID", "confirmPermanentDeletion": true }` |

Tracking status responses also include `paused` and `registrationId` (null when unregistered).
Mutations require the signed-in account and same-origin requests; client account selectors
are rejected. A stale registration ID returns 409. Private responses use `Cache-Control: no-store`.

The existing daily/recovery cron routes prepare one leased collection job per registration
and IST report day, including pending, paused, and blocked Telegram accounts. Upstream lookup
failures retry independently of Telegram failures. Only eligible unpaused services prepare
recaps. Shared empty-day reminders ignore paused platforms and remain silent when all are paused.

### Accepted-activity calendar

Every day uses Asia/Kolkata boundaries and counts distinct Accepted `titleSlug`s.
Re-solving a problem on another day counts for that day; repeated accepts on the
same day count once. The unique-problems summary deduplicates across the full
displayed range. Green intensity represents 1, 2–3, 4–7, and 8+ problems.

The authenticated `GET /api/tracking/activity` reads only the session account's
fixed username. It reuses `recentAcSubmissionList(limit: 20)` with public user
existence information, validates responses through the shared Accepted-history
service, and persists observations. One refresh per account per minute is enforced
with a database lease. Daily collection also saves its Accepted problems
and coverage, independently of whether recaps are enabled.

Public history is limited: the live API returns at most 20 entries even when
asked for 100. Complete historical unique Accepted activity cannot be reconstructed
from the submission calendar, which lacks problem identities. Unavailable days are
hatched, partial days have dotted borders, and counts/streaks are lower bounds when
coverage is incomplete. Empty history never proves a zero-solve day. Overlapping
observations extend known coverage; missing intervals remain unknown. Today reflects
the latest observation, while a completed day requires coverage through midnight.
Saved activity remains visible when a refresh fails. Keyboard users can navigate
the calendar with arrow keys, Home, and End; each day exposes its date, count, and
coverage to screen readers.

Select a calendar day to load its saved problems and open the original problem
links. Day selection reads only account-owned observations and makes no new
LeetCode or GFG request. GFG details use newly observed dates when verified solve
timestamps are unavailable and exclude the initial import in that mode.

Migration `0002_accepted_activity.sql` adds three account-scoped tables:
`accepted_activity` (one problem per day), `activity_days` (coverage), and
`activity_sync` (refresh state and leases). No new credentials or dependencies are
required. Apply migrations before deploying this dashboard update.

The tracking bot uses `/api/telegram/tracking/webhook`. The original
`/api/telegram/webhook`, its credentials, and all existing commands remain independent.

Configure these server-side variables in `.env.local` and Vercel:

| Variable                           | Purpose                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Pooled Neon runtime connection                                              |
| `DATABASE_URL_UNPOOLED`            | Direct connection for migrations                                            |
| `APP_URL`                          | Canonical website origin; `https://daily-tle-ruby.vercel.app` in production |
| `TRACKING_TELEGRAM_BOT_TOKEN`      | Second bot token, different from the existing bot                           |
| `TRACKING_TELEGRAM_BOT_USERNAME`   | Second bot's username                                                       |
| `TRACKING_TELEGRAM_WEBHOOK_SECRET` | Separate secret, 1–256 letters, digits, underscores, or hyphens             |
| `TELEGRAM_LOGIN_CLIENT_ID`         | Second bot's login client ID from BotFather                                 |
| `TELEGRAM_LOGIN_CLIENT_SECRET`     | Second bot's login client secret from BotFather                             |
| `CRON_SECRET`                      | Random bearer secret used by Vercel cron                                    |
| `TRACKING_REGISTRATION_ENABLED`    | `true` to open registration after setup; defaults to closed                 |

In the second bot's **Login Widget** settings in BotFather, register the website
origin and exact callback URL:
`https://daily-tle-ruby.vercel.app/api/auth/telegram/callback`.
For local sign-in, also allow `http://localhost:3000` and
`http://localhost:3000/api/auth/telegram/callback`. The client ID must match the
second bot's ID. Login uses OpenID Connect, PKCE, nonce, state, and signature
verification; it does not request phone numbers or direct-message permission.

If BotFather's chat says web login is unavailable and asks to link a website,
use `/setdomain`, select the tracking bot, and submit `daily-tle-ruby.vercel.app`.
That chat flow configures the legacy login widget. For this implementation's
OpenID Connect credentials, open **BotFather's mini app → tracking bot → Login
Widget**, add the allowed URLs there, and copy the displayed Client ID and
Client Secret. Keep its signing algorithm at the default **RS256**.

Apply the additive migrations, deploy with the variables above, and configure
only the second webhook:

```bash
npm run db:migrate
APP_URL=https://daily-tle-ruby.vercel.app npm run bot:setup
```

Run migrations from the project root. The command loads `.env.local` and uses
`DATABASE_URL_UNPOOLED`, falling back to `DATABASE_URL`. It allows 3 seconds per
network address attempt for slower connections. Failures report the error code
and migration filename when available without printing credentials or SQL.

The setup script checks the second bot's identity before changing its webhook.
To verify onboarding before general release, temporarily enable registration
on a test deployment, sign in, register a test username, and connect the bot.
Invoke the authenticated daily cron route to send a real report to that test
account, then inspect the dashboard. Cron eligibility includes accounts connected
before 8:30 a.m. IST; connections after that cutoff start the following day.
Use a separate test bot and database branch when testing previews so the
production webhook and registrations remain stable. Enable production registration
after verification.

### Registration stays closed after deployment

Registration requires the complete tracking configuration, not only the enabled
flag. In Vercel, make sure the variables above apply to **Production**, then
redeploy. `APP_URL` must be `https://daily-tle-ruby.vercel.app`, without the callback
path; `http://localhost:3000` is only accepted during local development. Enter
`true` without quotes or surrounding spaces for `TRACKING_REGISTRATION_ENABLED`.
The login client ID must belong to the second bot.

If the setup message persists, visit `/feature` and inspect that request in
Vercel's runtime logs. Search for `[tracking:setup] Registration unavailable`:
each issue names the missing or invalid variable and the reason. Logs never
include configuration values, and public error responses remain generic.
Variables in `.env.local` are not automatically uploaded to Vercel.

### Telegram approves sign-in but the website reports failure

Start a new sign-in from `https://daily-tle-ruby.vercel.app/feature` and finish it
in the same browser within ten minutes. Login first redirects deployment aliases
to the configured website origin so the callback receives its login cookie.
Authentication redirects are never cached.

Inspect the callback request in Vercel's runtime logs and search for
`[telegram:auth] Sign-in failed`. Only the failing stage and a safe reason are
logged, never authorization codes, cookies, tokens, profile data, or raw errors.
`missing_login_cookie` indicates a browser or website-origin mismatch;
`expired_or_consumed_login_attempt` requires starting a fresh login.
Token requests use `client_secret_post`, advertised in
[Telegram's discovery document](https://oauth.telegram.org/.well-known/openid-configuration).
The library submits the client ID and secret in the HTTPS form body with proper
URL encoding. Request bodies and credentials are never logged.
If `token_exchange` still reports `invalid_client`,
check the production login client ID and current Client Secret from the second
bot's Login Widget settings. `invalid_grant` can indicate an expired or reused code,
a callback URL mismatch, or failed PKCE validation. `account_save` or
`session_create` with a database code identifies a database configuration issue.
Fix the reported setting and retry; keep RS256, state, nonce, PKCE, and signature
verification enabled.

The verified profile's `id` accepts a positive safe integer or a decimal string
and is normalized before saving the account. The OIDC `sub` remains an opaque
identifier and is never substituted for a Telegram chat ID. At the `identity`
stage, `telegram_id_missing` means the profile ID was absent;
`telegram_id_invalid` means it could not be safely normalized. These reasons
never include claim values or token contents.

### Account and delivery guarantees

The first registration reserves a LeetCode username case-insensitively. Existence
is checked, but LeetCode ownership is unverified. Usernames, Telegram identities,
and connected private chats cannot be reassigned. Database triggers enforce
immutability even if application validation is bypassed. Private account and
delivery data are session-scoped; the existing public LeetCode APIs stay public.

Connection links expire in 15 minutes, are single-use, store only a token hash,
and work only for the same Telegram identity used on the website. Website sessions
expire after 30 days and are revoked on logout. Mutation endpoints require a
matching Origin header.

The primary and recovery cron routes are protected by `CRON_SECRET`; each runs
once daily on Vercel Hobby with hour-level scheduling precision. Fluid Compute
and a 300-second limit are configured in `vercel.json`. Processing uses ten
workers, five Telegram messages per second, per-chat spacing, and a 260-second
work budget. Delivery records retain the period, prepared messages, completed
parts, attempts, and retry delays. A database lease prevents overlapping dispatchers.
Unfinished reports can be retried up to three times on their delivery day; older
unfinished records are marked failed. A missed primary run is reconciled by recovery.

Only platforms with yesterday's saved problems send a recap. Empty LeetCode, GFG,
HackerRank, and Codeforces reports stay silent. When every scheduled platform check succeeds
and none has yesterday's problems, one shared message is sent per user and day:
`hmm..no question found.do it today, I will be waiting`.
The reminder reuses one delivery's durable retry state; recovery does not send one
reminder per platform. Empty platform status is shown as **No problems found**.
Incomplete public history adds a coverage warning to reports containing data.
Platform lookup failures are recorded as failed attempts and prevent the shared
reminder until recovery, rather than being treated as empty results. Telegram rate limits stop
recap sends until recovery; daily collection continues. Blocked chats cannot receive recaps. A crash after Telegram accepts
a message but before progress is saved can still produce a duplicate on retry.
The first release targets 100 users; monitor runtime and failures before increasing
that volume or adding a queue.

### Tracking API

| Method | Endpoint                                                       | Behavior                                                                              |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/tracking`                                                | Signed-in account's username, connection, and latest report status                    |
| POST   | `/api/tracking`                                                | Register with username and explicit agreement acceptance                              |
| POST   | `/api/tracking/telegram-link`                                  | Create a personal bot link with its expiry                                            |
| GET    | `/api/tracking/activity/day?platform=leetcode&date=2026-10-14` | Read the selected platform's saved problems for one IST date                          |
| GET    | `/api/tracking/goal?platform=leetcode`                         | Read the account's platform-specific weekly target                                    |
| PUT    | `/api/tracking/goal`                                           | Save `{ "platform": "leetcode", "weeklyTarget": 5 }`; use `null` to remove the target |
| GET    | `/api/auth/telegram/login`                                     | Begin Telegram sign-in                                                                |
| GET    | `/api/auth/telegram/callback`                                  | Verify Telegram identity and issue a session                                          |
| POST   | `/api/auth/logout`                                             | Revoke the current session                                                            |
| POST   | `/api/telegram/tracking/webhook`                               | Second bot's private-chat activation and pause/resume                                 |
| GET    | `/api/cron/tracking/daily`                                     | Prepare and dispatch yesterday's reports                                              |
| GET    | `/api/cron/tracking/retry`                                     | Reconcile and resume unfinished reports                                               |
| GET    | `/api/cron/tracking/weekly`                                    | Sunday 23:00 IST: dispatch current-week recaps for enabled platforms                  |
| GET    | `/api/cron/tracking/weekly-retry`                              | Sunday 23:30 IST: reconcile and recover the same weekly reports                       |

Unauthorized account requests return `401`, cross-origin mutations `403`, and
registration conflicts `409`. Existing LeetCode validation and upstream error
statuses are preserved. Account responses do not expose chat IDs or tokens.

### Account deletion

Profile → Delete account requires explicit confirmation. `DELETE /api/profile` accepts
`{ "confirmPermanentDeletion": true }` with an authenticated session and matching Origin.
An account-first transaction deletes all account-owned data, including notes, article
preferences/history, registrations, connection tokens, and sessions. Shared articles
remain available. Session cookies are cleared after success. External platform
accounts and Telegram messages already delivered are unaffected.
