# LeetCode Tracker

A Next.js API server that retrieves LeetCode profiles and recent submissions,
with a Telegram bot interface. The homepage provides an accessible command guide.

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
  page.tsx                     Telegram command guide
  not-found.tsx                Accessible missing-page response
lib/
  http/                        Shared API errors and runtime type guards
  leetcode/
    client.ts                  GraphQL transport, timeout, and safe errors
    queries.ts                 Queries and shared submission fields
    recent-submissions.ts      Recent-submission service
    user-profile.ts            Profile service and summary mapping
    validation.ts              Username and upstream-response validation
    types.ts                   API and domain types
  telegram/
    client.ts                  Telegram sendMessage transport
    commands.ts                Incoming update and command parsing
    format-submissions.ts      Plain-text formatting and message splitting
    replies.ts                 Command replies using LeetCode services
    webhook.ts                 Authentication and webhook orchestration
    types.ts                   Message and command types
tests/                         Unit and route integration tests with mocked HTTP
.github/workflows/ci.yml        Automated checks and production build
```

The server modules under `lib/leetcode` and `lib/telegram` are used by route
handlers. Both the HTTP API and bot call the same LeetCode services directly.
Public route names are retained for compatibility; source files use descriptive
kebab-case names and named exports.

## API reference

| Method | Endpoint                            | Behavior                                                      |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/user/[username]`              | Formatted profile, difficulty counts, and submission calendar |
| GET    | `/api/user/weeklySolved/[username]` | Up to 20 recent submissions                                   |
| GET    | `/api/user`                         | `400` with instructions to supply a username                  |
| POST   | `/api/telegram/webhook`             | Process supported bot commands                                |

Replace `[username]` with a LeetCode username. Surrounding whitespace is trimmed;
empty names and names containing whitespace are rejected.

`weeklySolved` is a legacy route name: results include successful and unsuccessful
recent submissions, with no seven-day filter or deduplication. Its response remains
`{ "recentSubmissionList": [...] }`. The profile API preserves its existing fields,
including `contributionPoint` and the array-valued `totalSubmissions`.

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

| Message                       | Reply                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `hello`                       | `welcome`                                                  |
| `name:your_leetcode_username` | Recent submissions, verdicts, languages, and problem links |
| `name:`                       | Usage instructions                                         |

The command prefix is case-insensitive; username capitalization is preserved.
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
   `hello` and `name:your_leetcode_username` in Telegram.

If a token was shared or committed, regenerate it through BotFather and update
both local and deployed configuration before registering the webhook again.
