# LeetCode Tracker

A Next.js API server that retrieves LeetCode profiles and recent submissions,
with an existing command bot and an independent daily-tracking bot. The website
provides Telegram sign-in, permanent username registration, and an Accepted-activity dashboard.

## Daily tracking setup

Users sign in with Telegram, register one LeetCode username, and tap **Start** on
their personal connection link. Yesterday's unique Accepted problems arrive at
**8:30–9:30 a.m. Asia/Kolkata**. Failed or interrupted reports are retried during
**9:30–10:30 a.m.** Daily commands are unnecessary; `/stop` pauses delivery and
`/start` resumes the same account.

After connecting the bot, setup redirects to `/dashboard`: bot status at the top,
a 365-day calendar in the center. Returning from Telegram checks the connection
automatically; the manual check remains available. Connected accounts visiting
`/tracking` go straight to their dashboard, including paused or blocked accounts.
Signed-in visitors to `/` are also redirected to `/dashboard`; accounts still
finishing registration or connection are guided back to `/tracking`. The public
homepage introduces LeetCode, GFG, and HackerRank tracking, with an illustrative
calendar, Telegram recap, features, and a setup guide. A live demo directly below
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

### Accepted-activity calendar

Every day uses Asia/Kolkata boundaries and counts distinct Accepted `titleSlug`s.
Re-solving a problem on another day counts for that day; repeated accepts on the
same day count once. The unique-problems summary deduplicates across the full
displayed range. Green intensity represents 1, 2–3, 4–7, and 8+ problems.

The authenticated `GET /api/tracking/activity` reads only the session account's
fixed username. It reuses `recentAcSubmissionList(limit: 20)` with public user
existence information, validates responses through the shared Accepted-history
service, and persists observations. One refresh per account per minute is enforced
with a database lease. Daily-report preparation also saves its Accepted problems
and coverage in the same transaction as its message parts.

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

If the setup message persists, visit `/tracking` and inspect that request in
Vercel's runtime logs. Search for `[tracking:setup] Registration unavailable`:
each issue names the missing or invalid variable and the reason. Logs never
include configuration values, and public error responses remain generic.
Variables in `.env.local` are not automatically uploaded to Vercel.

### Telegram approves sign-in but the website reports failure

Start a new sign-in from `https://daily-tle-ruby.vercel.app/tracking` and finish it
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
and HackerRank reports stay silent. When every scheduled platform check succeeds
and none has yesterday's problems, one shared message is sent per user and day:
`hmm..no question found.do it today, I will be waiting`.
The reminder reuses one delivery's durable retry state; recovery does not send one
reminder per platform. Empty platform status is shown as **No problems found**.
Incomplete public history adds a coverage warning to reports containing data.
Platform lookup failures are recorded as failed attempts and prevent the shared
reminder until recovery, rather than being treated as empty results. Telegram rate limits stop
new work until recovery; blocked chats are disabled. A crash after Telegram accepts
a message but before progress is saved can still produce a duplicate on retry.
The first release targets 100 users; monitor runtime and failures before increasing
that volume or adding a queue.

### Tracking API

| Method | Endpoint                                                       | Behavior                                                                              |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/tracking`                                                | Signed-in account's username, connection, and latest report status                    |
| POST   | `/api/tracking`                                                | Permanently register `{ "username": "name" }`                                         |
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

Unauthorized account requests return `401`, cross-origin mutations `403`, and
registration conflicts `409`. Existing LeetCode validation and upstream error
statuses are preserved. Account responses do not expose chat IDs or tokens.

## Optional GeeksforGeeks feature

Visit `/feature`, sign in with Telegram, and permanently register one public GFG
username. GFG is a separate opt-in: it works with or without a LeetCode username.
Connect the existing Daily Grind bot if you have not already connected Telegram.
The Feature page stays accessible after registration and shows your logged-in
status. Use Dashboard in the sticky navigation bar to view your progress.
The GFG section appears on the shared dashboard only after GFG registration,
with an independent calendar, profile total, difficulty breakdown, available dated
counts, and newly observed progress. `/stop` and
`/start` control delivery for all enabled services through the same bot.

Apply `0003_gfg_tracking.sql` **before deploying this feature**:

```bash
npm run db:migrate
```

The migration adds immutable GFG registration fields, normalized solved problems,
daily profile snapshots, and a five-minute synchronization cache with leases.
Delivery records gain a platform key so each service is prepared, sent, retried,
and deduplicated independently. Existing records default to LeetCode. The existing
tracking configuration, registration flag, bot, and cron jobs are reused.

### Verified upstream data and limitations

Live checks verified these public requests without GFG credentials:

- `GET https://authapi.geeksforgeeks.org/api-get/user-profile-info/?handle=USERNAME&article_count=false&redirect=true`
- `POST https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/`
  with `{ "handle": "USERNAME", "requestType": "", "year": "", "month": "" }`.

The profile supplies `data.total_problems_solved`. The solved inventory supplies
`status`, `count`, and `result`, whose School/Basic/Easy/Medium/Hard buckets contain
`slug`, `pname`, and `user_subtime`. Slugs identify unique problems; numeric bucket
keys are not treated as stable problem identifiers. Difficulty counts come from
deduplicated inventory records, and discrepancies against the profile total are
reported as incomplete coverage. These undocumented public endpoints may change.
Timeouts, rate limits, malformed responses, and missing profiles produce safe
errors; saved progress survives upstream failures.

The checked live sample returned 242 distinct solved problems, but all timestamps
were unqualified strings such as `2026-04-30 22:40:24`. Their timezone and first-ever
acceptance semantics could not be verified. These strings are preserved as
`reportedSubmissionTime`; **no timezone or first-accept date is invented**.
`acceptedAt` remains null unless the upstream value explicitly contains a valid
timezone offset. Available qualified dates use the earliest recorded timestamp,
Asia/Kolkata day boundaries, and Monday-start weeks, with a coverage caveat.

For the current upstream shape, exact daily/weekly solve counts and series are
null. The calendar instead records newly observed solved-problem IDs after the
initial registration baseline. This is observation activity, not a reconstructed
historical solve calendar. Snapshot totals are never differenced to fabricate
daily solves. Daily GFG recaps include problems with qualified timestamps in
yesterday's period and saved observations first seen yesterday, labeled with
unverified solve dates. The initial inventory and problems first observed today
are excluded from yesterday's recap. A GFG recap without qualifying problems is
silent. Retry preparation retains the stored period.

### GFG API

| Method | Endpoint              | Purpose                                                |
| ------ | --------------------- | ------------------------------------------------------ |
| GET    | `/api/tracking/gfg`   | Signed-in account's GFG registration and report status |
| POST   | `/api/tracking/gfg`   | Register `{ "username": "your_gfg_username" }` once    |
| GET    | `/api/gfg/[username]` | Registered account's cached GFG progress               |

The progress endpoint requires sign-in and GFG opt-in for the same username;
other accounts cannot access stored observations. Registration and connection
mutations require a matching Origin. Public-profile ownership is unverified,
and a GFG username is reserved case-insensitively, independently of LeetCode.

Example after registration:

```text
GET /api/gfg/your_gfg_username?period=all&includeProblems=true&timezone=Asia/Kolkata
```

Supported `period` values are `daily`, `weekly`, and `all`. `includeProblems`
is `true` or `false`. Optional ISO `startDate` is inclusive and `endDate` is
exclusive; series are filtered before weekly grouping. The timezone is fixed
to Asia/Kolkata. Responses include `totalSolved`, `difficultyBreakdown`,
`solvedToday`, `solvedThisWeek`, `dailySolved`, `weeklySolved`, `observedToday`,
`observedThisWeek`, `days`, `snapshots`, `dateBasis`, `limitations`, and optional
`solvedProblems`. Unavailable dated metrics are null rather than zero.

Representative fields for a registered profile with one newly observed problem
(the default calendar contains 365 days):

```json
{
  "platform": "gfg",
  "username": "your_gfg_username",
  "totalSolved": 2,
  "difficultyBreakdown": { "School": 0, "Basic": 0, "Easy": 1, "Medium": 1, "Hard": 0 },
  "timezone": "Asia/Kolkata",
  "dateBasis": "observation",
  "solvedToday": null,
  "solvedThisWeek": null,
  "dailySolved": null,
  "weeklySolved": null,
  "observedToday": 1,
  "observedThisWeek": 1,
  "days": [{ "date": "2026-10-14", "count": 1, "coverage": "partial" }],
  "snapshots": [{ "date": "2026-10-14", "totalSolved": 2 }],
  "checkedAt": "2026-10-14T03:00:00.000Z"
}
```

Implementation lives in `lib/gfg`, with registration and delivery infrastructure
reused from `lib/tracking`. Tests cover response parsing, deduplication, timestamps,
week boundaries, opt-in authorization, feature sign-in, independent calendars,
immutable registration, snapshot baselines, leases, cache backoff, and both-platform
report preparation and recovery.

## Optional HackerRank feature

Choose **HackerRank** on `/feature` (or open `/feature?platform=hackerrank`), sign in
with Telegram, and register one public username permanently. It works independently
of LeetCode and GFG. The Feature page remains accessible with a Logged in status;
use Dashboard in the sticky navigation to view progress. The HackerRank section
appears only after registration, with its own 365-day calendar and saved problem
links when selecting a day. The removed weekly practice/observation sections remain
absent. Today/week summary counts reflect available saved activity.

The existing Daily Grind connection, registration configuration, cron schedules,
and `/start` / `/stop` commands are reused. HackerRank gets its own per-day delivery,
report preparation, retry state, and upstream rate-limit backoff. A HackerRank-only
account can connect to the bot without registering another platform. Recaps use the
stored previous Asia/Kolkata calendar day and retain problems already saved by a
dashboard refresh. Prepared message parts survive retries without re-fetching.

Before deploying, run `npm run db:migrate` from the project root using the target
database configuration. `0005_hackerrank_tracking.sql` adds immutable registration,
normalized problems, snapshots, and sync leases, and extends platform constraints.
No additional environment variables or bots are needed.

### HackerRank public data and limitations

Read-only live checks verified these public endpoints without HackerRank credentials:

- `GET https://www.hackerrank.com/rest/hackers/USERNAME`
- `GET https://www.hackerrank.com/rest/hackers/USERNAME/recent_challenges?limit=20&response_version=v2`
- Further pages pass the returned opaque `cursor` until `last_page` is true.

The official public profile's [client code](https://hrcdn.net/fcore/assets/static/js/async/hackerrank_r_community.08ac76eed4.js)
labels this feed as solved challenges. Records provide `name`, `ch_slug`, `con_slug`,
`url`, and `created_at` with a timezone offset. Challenge identity combines contest
and challenge slug. Links are validated and constructed on HackerRank's origin.
The earliest reported timestamp observed for each challenge is retained. These
undocumented endpoints can change; the feed does not guarantee first-ever solve
dates, an exhaustive lifetime inventory, an overall solve total, or difficulties.
Submission-history counts are attempts and are not used as solved counts.

Each refresh reads at most five pages of 20 records, with a 20-second total timeout.
Older saved challenges survive later bounded fetches. A five-minute cache and refresh
lease avoid repeated upstream requests. Failures preserve saved progress and trigger
backoff. The dashboard labels counts as lower bounds and unavailable dates as unknown;
missing records never establish a zero-solve day. Even a fully paginated public feed
is not proof of exhaustive history. Daily reports include the same coverage caveat.
Public-profile ownership is unverified; usernames are reserved case-insensitively.

### HackerRank API

| Method | Endpoint                                                         | Purpose                                                |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/tracking/hackerrank`                                       | Own registration and report status                     |
| POST   | `/api/tracking/hackerrank`                                       | Permanently register `{ "username": "your_username" }` |
| GET    | `/api/hackerrank/[username]`                                     | Own cached calendar and saved counts                   |
| GET    | `/api/tracking/activity/day?platform=hackerrank&date=YYYY-MM-DD` | Own saved problem links for an IST day                 |

All endpoints require sign-in; progress and day details require the matching opt-in.
Responses disable caching, and registration requires a matching Origin. Saved day
selection never calls HackerRank. Telegram authentication returns to the selected
HackerRank feature after success or failure.

## Database verification

```bash
npm run test:db
```

Tests use `TEST_DATABASE_URL`, or the local `DATABASE_URL_UNPOOLED`, to create
a random isolated `tracking_test_…` schema and remove only that schema afterward.
They exercise real Postgres constraints, concurrent registrations, sessions,
connection-token ownership and expiry, delivery leases, message-part recovery,
blocked chats, retry delays, and a 100-user batch. All Telegram calls are mocked.
CI runs these tests against an isolated Postgres service.

## Local development

Use Node.js 22 (`.nvmrc`) and npm. The supported runtime range is recorded in
`package.json`.

```bash
npm ci
```

For a new clone, copy `.env.example` to `.env.local` and fill in your credentials.
If `.env.local` already exists, edit it directly to preserve your configuration.

```bash
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Real credentials belong in
`.env.local` or your deployment host, never in `.env.example` or Git.

## Project structure

```text
app/
  api/                         HTTP entry points; validation and service calls
  globals.css                  Responsive styles and keyboard focus states
  layout.tsx                   Metadata, language, fonts, and skip link
  page.tsx                     Daily tracking homepage and signed-in redirect
  tracking/                    LeetCode registration and account status
  feature/                     Independent GFG and HackerRank opt-in
  dashboard/                   Shared activity dashboard
  not-found.tsx                Accessible missing-page response
lib/
  auth/                        Telegram OpenID Connect and hashed database sessions
  db/                          Drizzle schema and pooled connection
  gfg/                         GFG public inventory, cache, calendar, and recaps
  hackerrank/                  HackerRank public solved history, cache, calendar, and recaps
  tracking/                    Registration, second webhook, and durable daily dispatch
  http/                        Shared API errors and runtime type guards
  leetcode/
    client.ts                  GraphQL transport, timeout, and safe errors
    queries.ts                 Queries and shared submission fields
    recent-submissions.ts      Recent-submission service
    last-week-solved.ts        Previous calendar-week solved questions
    last-day-solved.ts         Yesterday's solved questions
    calendar-periods.ts        Asia/Kolkata calendar boundaries
    solved-questions.ts        Accepted-history validation, filtering, and deduplication
    user-profile.ts            Profile service and summary mapping
    validation.ts              Username and upstream-response validation
    types.ts                   API and domain types
  telegram/
    client.ts                  Telegram sendMessage transport
    commands.ts                Incoming update and command parsing
    format-submissions.ts      Plain-text formatting and message splitting
    format-solved-questions.ts Calendar-period results and coverage warnings
    replies.ts                 Command replies using LeetCode services
    webhook.ts                 Authentication and webhook orchestration
    types.ts                   Message and command types
tests/                         Unit and route integration tests with mocked HTTP
migrations/                    Additive tracking schema and identity constraints
scripts/                       Migration and second-bot setup commands
.github/workflows/ci.yml        Automated checks and production build
```

The server modules under `lib/leetcode` and `lib/telegram` are used by route
handlers. Both the HTTP API and bot call the same LeetCode services directly.
Public route names are retained for compatibility; source files use descriptive
kebab-case names and named exports.

## API reference

| Method | Endpoint                            | Behavior                                                                 |
| ------ | ----------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/user/[username]`              | Formatted profile, difficulty counts, and submission calendar            |
| GET    | `/api/user/weeklySolved/[username]` | Up to 20 recent submissions                                              |
| GET    | `/api/user/lastweek/[username]`     | Unique Accepted problems from the previous calendar week in Asia/Kolkata |
| GET    | `/api/user/lastday/[username]`      | Unique Accepted problems from yesterday in Asia/Kolkata                  |
| GET    | `/api/user`                         | `400` with instructions to supply a username                             |
| POST   | `/api/telegram/webhook`             | Process supported bot commands                                           |

Replace `[username]` with a LeetCode username. Surrounding whitespace is trimmed;
empty names and names containing whitespace are rejected.

`weeklySolved` is a legacy route name: results include successful and unsuccessful
recent submissions, with no seven-day filter or deduplication. Its response remains
`{ "recentSubmissionList": [...] }`. The profile API preserves its existing fields,
including `contributionPoint` and the array-valued `totalSubmissions`.

### Calendar-period solved questions

`lastweek` covers the previous Monday–Sunday week, and `lastday` covers yesterday,
both in **Asia/Kolkata**. These are calendar periods, rather than rolling seven-day
or 24-hour windows. The start is inclusive and the end is exclusive; both are
serialized as UTC ISO timestamps.

The services request the 20 most recent public **Accepted** submissions and count
each `titleSlug` once within the selected period. Re-solving an older problem
qualifies. Each question retains its newest Accepted timestamp within the period,
and questions are ordered newest first.

Both endpoints return this shape:

```json
{
  "username": "example",
  "period": "lastweek",
  "timezone": "Asia/Kolkata",
  "start": "2026-10-04T18:30:00.000Z",
  "end": "2026-10-11T18:30:00.000Z",
  "count": 1,
  "questions": [{ "title": "Two Sum", "titleSlug": "two-sum", "timestamp": "1791455400" }],
  "mayBeIncomplete": true
}
```

That example covers 5–11 October 2026 in Asia/Kolkata. `period` is `lastweek` or
`lastday`; `count` describes matching unique problems found in available history.
`mayBeIncomplete` is false only when a returned entry predates the period's start.
Otherwise it is true, including when public history is empty. Partial results still
return `200`; do not interpret an incomplete result as a complete period total.

API errors use `{ "error": "message" }`:

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| 400    | Invalid input or invalid webhook JSON                               |
| 401    | Webhook secret is missing or incorrect when verification is enabled |
| 404    | LeetCode profile was not found                                      |
| 500    | Missing bot configuration or an unexpected internal failure         |
| 502    | An external service failed or returned malformed data               |
| 504    | LeetCode request timed out                                          |

LeetCode and Telegram requests have ten-second timeouts. Upstream details and bot
tokens are excluded from public error responses.

## Telegram setup

| Environment variable      | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Server-side BotFather token; required for supported commands     |
| `TELEGRAM_WEBHOOK_SECRET` | Optional webhook verification secret; recommended for deployment |

The webhook secret must use letters, digits, `_`, or `-` and be 1–256 characters.
Use exactly the same value in the server environment and `setWebhook` registration.

Expose your local server through an HTTPS tunnel, or deploy the app. Register a
publicly reachable HTTPS URL with Telegram, replacing the placeholders:

```bash
curl --request POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=https://YOUR_PUBLIC_DOMAIN/api/telegram/webhook" \
  --data-urlencode "secret_token=YOUR_WEBHOOK_SECRET" \
  --data-urlencode 'allowed_updates=["message"]'
```

If verification is disabled, omit the `secret_token` line. Telegram cannot deliver
to `localhost` alone. See the [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook).

Send these messages in a private chat with your bot:

| Message                           | Reply                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| `/start`                          | Static bot description, requirements, and getting-started instructions |
| `/command`                        | All username queries with descriptions and usage                       |
| `/help`                           | Alias for the query guide                                              |
| `profile:your_leetcode_username`  | Profile totals by difficulty and ranking                               |
| `accepted:your_leetcode_username` | Unique recently Accepted problems with timestamps and links            |
| `today:your_leetcode_username`    | Unique Accepted problems from IST midnight through the current instant |
| `thisweek:your_leetcode_username` | Unique Accepted problems since Monday IST through the current instant  |
| `hello`                           | `welcome`                                                              |
| `name:your_leetcode_username`     | Recent submissions, verdicts, languages, and problem links             |
| `lastweek:your_leetcode_username` | Unique Accepted problems from the previous Monday–Sunday week          |
| `lastday:your_leetcode_username`  | Unique Accepted problems from yesterday                                |
| `name:`                           | Usage instructions                                                     |

The command prefix is case-insensitive; username capitalization is preserved.
`/start`, `/command`, and `/help` accept Telegram's `@bot_username` suffix. `/start`
accepts an optional start payload and always returns the same introduction.
The introduction lists navigation commands and requirements; username queries appear
in `/command` and `/help`. All three help replies are static and do not request
LeetCode data. On-demand lookups need
only a public LeetCode username, with no website registration or LeetCode password.
Send one command per message. Empty usernames and semicolon batches such as
`lastweek:example; lastday:example` receive usage instructions. The period replies
include calendar dates, timezone, a unique count, problem titles and links, and a
coverage warning when results may be incomplete. Empty results say no matching
problems were found in available public history.
Other messages and non-text updates are acknowledged without a reply. Replies are
split at Telegram's message-length limit while preserving complete emoji.

A failed LeetCode lookup sends a retry message and acknowledges the update. A
failed Telegram reply returns `502`, allowing Telegram to retry delivery. Replies
are not stored or deduplicated, so a repeated delivery can produce repeated replies.

Inspect delivery errors with:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

Opening the webhook URL in a browser returns `405`: the endpoint accepts POST.

## Quality checks

```bash
npm run check       # Formatting, lint, generated route types, TypeScript, and tests
npm run build       # Production compilation and route validation
npm run format      # Apply consistent formatting
npm run test:watch  # Watch tests during development
```

CI runs the same checks and build. Tests mock external HTTP calls and use dummy
credentials; they do not send Telegram messages. Formatting uses
[Prettier](https://prettier.io/docs/install), and tests use
[Vitest 4](https://v4.vitest.dev/guide/) to support the project's runtime range.

When adding a feature, keep HTTP handlers focused on the request/response boundary,
place service logic in the relevant `lib` module, validate external data before
using it, and add tests for changed behavior. Update this reference when contracts
or commands change. The Next.js-specific instructions in `AGENTS.md` apply.

For UI changes, preserve semantic headings and landmarks, keyboard access, visible
focus states, contrast in both themes, and layouts that work on small screens.
The homepage includes a skip link to the main content and a labeled static preview.

## Deploy on Vercel

1. Import the repository with the **Next.js** preset and the repository root as the
   root directory. Use `npm run build` and the default output directory.
2. In **Settings → Environment Variables**, add the bot token and webhook secret
   for **Production**. Add Preview values only when testing a preview deployment.
   `.env.local` stays on your computer; `.env.example` is a blank template.
3. Deploy or redeploy after saving variables; changes apply to new deployments.
   See [Vercel's environment variable documentation](https://vercel.com/docs/environment-variables).
4. Register your production URL with Telegram using the command above, then test
   `/start`, `/command`, `hello`, `name:your_leetcode_username`, `lastweek:your_leetcode_username`, and
   `lastday:your_leetcode_username` in Telegram. An existing webhook registration
   continues to use the same URL after redeployment.

If a token was shared or committed, regenerate it through BotFather and update
both local and deployed configuration before registering the webhook again.
