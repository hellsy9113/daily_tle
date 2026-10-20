# Daily Articles

An optional, account-owned Feature service, independent of Telegram. Register on
Feature with one or two topics: DSA/interview prep, AI/ML, web development, system
design, or language tutorials. Manage topics, pause/resume, and revoke there. Read
articles from the Dashboard's Articles tab. All private APIs require the ordinary
signed-in session; Notes codes do not grant access.

## Catalog and selection

A shared catalog stores canonical URL, title, publisher, publication date, topic
labels, and an excerpt limited to 55 words / 320 characters. Only publisher feed
summaries or API descriptions are used. Full article pages and feed content bodies
are never copied. Undated articles are eligible only from evergreen sources;
missing dates/excerpts are explicitly identified in the interface.

Selection happens atomically on the first authenticated read each Asia/Kolkata day.
Account-first locks serialize reads with lifecycle changes. Unique subscription/day
headers and six numbered slots prevent duplicate selections and excess items.
Selection prefers matching unseen articles published within the last 30 days,
then unseen evergreen content. Future publications and old non-evergreen news are
excluded. Previously selected articles are never repeated: exhaustion produces
fewer than six, or an empty list. Ordinary reads preserve the saved list until
midnight IST. The first explicit refresh each IST day fills empty slots while keeping
existing selections. Later refreshes replace the visible list with up to six different
unseen catalog matches, newest first; if exhausted, the current list is retained. Topic changes apply to the next day's selection. Each account
has independent preferences and seen history. Ordinary reads only query PostgreSQL.

Revocation deletes preferences, daily selections and seen history transactionally.
It preserves the shared catalog, account, and other services. Re-registration creates
a new generation and a fresh history. Pause blocks feed access without deleting
history; resume can reveal the same day's saved selection.

## User-triggered refresh

The Dashboard's **Refresh articles** button also refreshes the shared catalog.
`POST /api/articles/refresh` requires the account session, matching Origin and current
`{ registrationId }`. Topics are read from the subscription on the server; callers
cannot provide topics, source URLs, or another account ID. Dedicated publisher feeds
are chosen by saved topics; broad feeds such as freeCodeCamp remain relevant across
several topics. Complete metadata batches from these feeds are retained in the
shared catalog so ETag/304 caching never loses articles for other topic subscribers.
Daily selections still use each reader's own topic preferences.

The first refresh each IST day atomically reserves upstream work per registration.
The existing `nextRefreshAt` timestamp stores that reservation plus 15 minutes; it
is retained for compatibility and no longer blocks catalog-only refreshes. Later clicks
that IST day only rotate unseen catalog matches and never contact publishers, even
after the old 15-minute window expires. The next IST day permits upstream work again.
Cron and the first manual refresh share publisher leases, six-hour successful-poll cooldowns, conditional
headers, robots policy and Retry-After/backoff. Another account can refresh independently
but cannot bypass a publisher's shared cooldown. Concurrent cron/manual work only
fetches an eligible source once. No account locks are held during network requests;
completion rechecks the registration generation and pause state. Revocation deletes
the account's cooldown along with its subscription and history.

The manual route has the same 60-second maximum and 40-second work budget as cron.
It runs on Daily TLE's server and consumes the application's hosting/network/database
allowance. It does not charge users directly or transfer hosting usage to their
browser. No additional cron jobs are configured.

The result reports catalog additions, cached/cooling sources, and partial source
failures. The UI then immediately displays the saved list with empty slots filled from the
updated catalog. The first refresh preserves existing articles. Later refreshes replace them with up to
six unseen relevant catalog matches, retaining seen history to prevent repeats.
Exhaustion retains the current list without a notice. Cron only ingests shared metadata; it never fills
or modifies an existing user's list. Manual refresh is a separate authenticated POST
and does not invoke the cron endpoint. Both can independently execute; shared source
leases and cooldowns prevent duplicate publisher requests if they happen to overlap.
Today's original topic snapshot still applies; edited topics take effect tomorrow. **Retry reading list** only rereads PostgreSQL and starts no upstream work.

## Sources and access

| Publisher     | Public metadata endpoint                             | Coverage                                                     |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| freeCodeCamp  | https://www.freecodecamp.org/news/rss/               | Classified development, languages, DSA, AI, design tutorials |
| web.dev       | https://web.dev/feed.xml                             | Web development                                              |
| Google AI     | https://blog.google/technology/ai/rss/               | AI / ML                                                      |
| Martin Fowler | https://martinfowler.com/feed.atom                   | System design                                                |
| Real Python   | https://realpython.com/atom.xml                      | Language tutorials; evergreen fallback                       |
| AWS on DEV    | https://dev.to/api/articles?username=aws&per_page=30 | Classified AWS publisher articles                            |

Sources are fixed in `lib/articles/sources.ts`; classification uses title, excerpt,
and tags plus curated publisher defaults. Relevance is heuristic, not a guarantee
of subject coverage every day. AWS canonical links are restricted to DEV and the
configured AWS publisher hosts. New sources require a code review of their public
access rules and allowed article hosts. No keys or paid summarization APIs are used.

The fetcher identifies itself as `DailyTLE-Articles/1.0`, checks robots.txt before
feeds, caches policy for 24 hours, and fails closed on policy errors or denial.
It honors Crawl-delay (up to 10 seconds inline; longer delays defer the feed until
a later invocation within the policy cache window; scheduled rechecks may continue
to defer such sources). Conditional ETag/Last-Modified requests reduce transfers.
429/503 Retry-After and exponential failure backoff delay subsequent requests;
normal successful polls have at least six hours of cooldown. No access controls,
subscriptions, or paywalls are bypassed. Publisher availability/rules can change.

Feed requests have five-second timeouts, same-host HTTPS redirects only (maximum
two), bounded bodies (2 MiB feed / 128 KiB robots), and at most 100 parsed entries.
XML entity declarations are rejected. Canonical URL uniqueness removes tracking
parameters/fragments and deduplicates before batched conflict-safe inserts.
Immutable metadata keeps saved daily selections stable after later ingestion.

## Schedule and Vercel Hobby

One new job: `GET /api/cron/articles/refresh`, `0 0 * * *` UTC, authenticated with
Vercel's existing `Authorization: Bearer <CRON_SECRET>` convention. On Hobby it
runs sometime from **05:30 to 06:29 IST**, not at an exact minute. There are now
six project jobs; all run at most once per day, within Hobby's 100-job project cap.
No hourly article jobs or cron retries are added. See Vercel's
[cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The route declares `maxDuration = 60`, limits its work budget to 40 seconds, and
reserves 22 seconds before starting each sequential source. Source leases prevent
concurrent refreshes from duplicating work; expired leases are recoverable and
writes require the current lease token. Cold/least recently successful sources go
first, so slow publishers do not permanently starve other feeds. Deferred or failed
sources wait for another authorized invocation or the next daily run. Responses
report source/insert/failure/skip/defer counts; `article_source_state` records the
last failure and retry eligibility. A successful cron response can include individual
source failures: inspect these counters/state when monitoring ingestion.

This fits Hobby's scheduling and function-duration constraints. It cannot guarantee
zero billing or unlimited usage: existing application/database usage still counts
against provider quotas. No hosting plan change is required by this feature.

## Configuration and migration

Apply `0013_daily_articles.sql` and `0014_article_manual_refresh.sql` through the existing `npm run db:migrate` workflow
after the preceding migrations, using the intended environment's database URL.
No new environment variables are needed beyond the existing database/session
configuration and `CRON_SECRET`. No production migration is run as part of development. Migration `0014` adds the
subscription cooldown timestamp with an epoch default, leaving existing registrations
ready for their first manual refresh.

The migration adds account registration state, catalog, subscriptions, daily headers,
feed items, seen history, and source state. Catalog topic GIN/publication/evergreen
indexes support selection; subscription/day uniqueness, per-account ownership,
seen lookup and source due indexes support bounded reads and jobs. Server validation
and database constraints enforce topic limits and six slots. Private responses are
`no-store`; mutations enforce Origin and current generation.

Shared catalog and source state persist across revocations. There is no automatic
catalog or account-history retention cleanup yet; storage grows with ingestion and
selections and should be monitored before introducing a separate retention policy.

If upstream access fails or the budget expires, existing catalog entries remain
available and unseen evergreen matches fill gaps. No fabricated articles or full
article copies are generated. Loading, empty, error and retry states use the shared
resource hook; retrying a read does not trigger upstream requests or change today's
saved selection. Explicit catalog refresh is separate: it fetches metadata and
atomically fills remaining slots on the first refresh each IST day. Later refreshes
rotate the visible list using the catalog alone, retaining it if no unseen matches remain.

## Verification

Run `npm run check`, `npm run build`, and `npm run test:db` with
`TEST_DATABASE_URL` pointing to a disposable PostgreSQL database. Database tests apply
migrations in an isolated schema and cover limits, IST rollover, stable/empty
selections, account isolation, concurrent reads/jobs, canonical deduplication,
source leases/backoff, manual refresh cooldowns and saved-topic scoping, concurrent
cron/manual refreshes, pause/resume/revoke and stale generations.
