This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Telegram webhook

`POST /api/telegram/webhook` replies with `welcome` in the same chat when someone
sends `hello` to your bot. Send `name:your_leetcode_username` (for example,
`name:leetcode`) to fetch the same results as
`GET /api/user/weeklySolved/[username]` and receive a list of titles, statuses,
languages, and problem links. The existing API returns up to 20 recent submissions;
it does not filter them to the past seven days. Long replies are split into multiple
Telegram messages. Matching ignores case for `hello` and the `name:` prefix,
and allows surrounding whitespace. Other messages and update types are
acknowledged without a reply.

1. Copy `.env.example` to `.env.local` if you do not already have a local env file,
   then set `TELEGRAM_BOT_TOKEN` to your BotFather token. You can also set
   `TELEGRAM_WEBHOOK_SECRET` to a random secret using letters, digits, `_`, or `-`.
   Keep these values server-side and out of Git.
2. Run `npm run dev`. Expose port 3000 through an HTTPS tunnel for local testing,
   or deploy the app and configure the same environment variables on your host.
3. Register your public HTTPS endpoint with Telegram, replacing the placeholders:

   ```bash
   curl --request POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
     --data-urlencode "url=https://YOUR_PUBLIC_DOMAIN/api/telegram/webhook" \
     --data-urlencode "secret_token=YOUR_WEBHOOK_SECRET" \
     --data-urlencode 'allowed_updates=["message"]'
   ```

   Use the same secret as `TELEGRAM_WEBHOOK_SECRET`. If you leave that variable
   empty, omit the `secret_token` line. Telegram needs a publicly reachable HTTPS
   URL; `localhost` alone will not work. Restart the server after changing env values.
4. Open a private chat with your bot and send `hello`. It should reply `welcome`.
   Send `name:your_leetcode_username` to receive your recent submissions.
   An empty username gets a usage message. A lookup failure gets a retry message.

You can inspect delivery errors with
`https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo`. The handler returns a
non-success status when sending fails so Telegram can retry delivery.
See the [Telegram Bot API documentation](https://core.telegram.org/bots/api#setwebhook)
for webhook registration details.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

1. Import this repository into Vercel with the **Next.js** framework preset and
   the repository root as the root directory. Use `npm run build` as the build
   command and keep the default output directory.
2. In your Vercel project's **Settings → Environment Variables**, add
   `TELEGRAM_BOT_TOKEN` and, if you use webhook verification,
   `TELEGRAM_WEBHOOK_SECRET`. Select **Production** (and **Preview** only if you
   intend to test that deployment). `.env.local` stays on your computer;
   `.env.example` is a blank template and is not loaded as production configuration.
3. Deploy or redeploy after saving the variables. Environment variable changes
   only apply to new deployments. See
   [Vercel's environment variable documentation](https://vercel.com/docs/environment-variables).
4. Once deployment is ready, run the `setWebhook` command above with your production
   URL: `https://YOUR_PROJECT.vercel.app/api/telegram/webhook`. Use your current bot
   token and the same webhook secret as the Vercel environment variable.

The webhook accepts **POST** requests. Opening its URL in a browser sends GET and
returns `405 Method Not Allowed`; test by sending `hello` in Telegram instead.

Keep real credentials out of `.env.example`. If a token was shared or committed,
regenerate it through BotFather and update both your local environment and Vercel
before registering the webhook again.
