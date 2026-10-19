# Development and deployment

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
4. Register your production URL with Telegram using the [webhook setup command](api.md#telegram-setup), then test
   `/start`, `/command`, `hello`, `name:your_leetcode_username`, `lastweek:your_leetcode_username`, and
   `lastday:your_leetcode_username` in Telegram. An existing webhook registration
   continues to use the same URL after redeployment.

If a token was shared or committed, regenerate it through BotFather and update
both local and deployed configuration before registering the webhook again.
