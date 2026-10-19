# Public APIs and command bot

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
