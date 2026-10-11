This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Telegram webhook

`POST /api/telegram/webhook` replies with `welcome` in the same chat when someone
sends `hello` to your bot. Matching ignores case and surrounding whitespace;
other messages and update types are acknowledged without a reply.

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

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
