# LeetCode Tracker

A Next.js API server that retrieves LeetCode profiles and recent submissions,
with an existing command bot and an independent daily-tracking bot. The website
provides Telegram sign-in, permanent username registration, and account status.

## Daily tracking setup

Users sign in with Telegram, register one LeetCode username, and tap **Start** on
their personal connection link. Yesterday's unique Accepted problems arrive at
**8:30–9:30 a.m. Asia/Kolkata**. Failed or interrupted reports are retried during
**9:30–10:30 a.m.** Daily commands are unnecessary; `/stop` pauses delivery and
`/start` resumes the same account.

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

Empty results send `hmm..no question found.do it today, I will be waiting`.
Incomplete public history adds a coverage warning. LeetCode failures are recorded
as failed attempts and never reported as empty results. Telegram rate limits stop
new work until recovery; blocked chats are disabled. A crash after Telegram accepts
a message but before progress is saved can still produce a duplicate on retry.
The first release targets 100 users; monitor runtime and failures before increasing
that volume or adding a queue.

### Tracking API

| Method | Endpoint                         | Behavior                                                           |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/tracking`                  | Signed-in account's username, connection, and latest report status |
| POST   | `/api/tracking`                  | Permanently register `{ "username": "name" }`                      |
| POST   | `/api/tracking/telegram-link`    | Create a personal bot link with its expiry                         |
| GET    | `/api/auth/telegram/login`       | Begin Telegram sign-in                                             |
| GET    | `/api/auth/telegram/callback`    | Verify Telegram identity and issue a session                       |
| POST   | `/api/auth/logout`               | Revoke the current session                                         |
| POST   | `/api/telegram/tracking/webhook` | Second bot's private-chat activation and pause/resume              |
| GET    | `/api/cron/tracking/daily`       | Prepare and dispatch yesterday's reports                           |
| GET    | `/api/cron/tracking/retry`       | Reconcile and resume unfinished reports                            |

Unauthorized account requests return `401`, cross-origin mutations `403`, and
registration conflicts `409`. Existing LeetCode validation and upstream error
statuses are preserved. Account responses do not expose chat IDs or tokens.

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
  page.tsx                     Daily tracking introduction and command guide
  tracking/                    Registration and account status
  not-found.tsx                Accessible missing-page response
lib/
  auth/                        Telegram OpenID Connect and hashed database sessions
  db/                          Drizzle schema and pooled connection
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

| Message                           | Reply                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| `hello`                           | `welcome`                                                     |
| `name:your_leetcode_username`     | Recent submissions, verdicts, languages, and problem links    |
| `lastweek:your_leetcode_username` | Unique Accepted problems from the previous Monday–Sunday week |
| `lastday:your_leetcode_username`  | Unique Accepted problems from yesterday                       |
| `name:`                           | Usage instructions                                            |

The command prefix is case-insensitive; username capitalization is preserved.
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
The homepage includes a skip link to the main content and wrapping command text.

## Deploy on Vercel

1. Import the repository with the **Next.js** preset and the repository root as the
   root directory. Use `npm run build` and the default output directory.
2. In **Settings → Environment Variables**, add the bot token and webhook secret
   for **Production**. Add Preview values only when testing a preview deployment.
   `.env.local` stays on your computer; `.env.example` is a blank template.
3. Deploy or redeploy after saving variables; changes apply to new deployments.
   See [Vercel's environment variable documentation](https://vercel.com/docs/environment-variables).
4. Register your production URL with Telegram using the command above, then test
   `hello`, `name:your_leetcode_username`, `lastweek:your_leetcode_username`, and
   `lastday:your_leetcode_username` in Telegram. An existing webhook registration
   continues to use the same URL after redeployment.

If a token was shared or committed, regenerate it through BotFather and update
both local and deployed configuration before registering the webhook again.
