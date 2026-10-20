# Platform integrations

## Optional GeeksforGeeks feature

Sign in with Telegram, choose **GeeksforGeeks** on `/feature`, and
register one public GFG username. GFG is a separate opt-in: it works with or without a LeetCode username.
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

| Method | Endpoint              | Purpose                                                  |
| ------ | --------------------- | -------------------------------------------------------- |
| GET    | `/api/tracking/gfg`   | Signed-in account's GFG registration and report status   |
| POST   | `/api/tracking/gfg`   | Register with username and explicit agreement acceptance |
| GET    | `/api/gfg/[username]` | Registered account's cached GFG progress                 |

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

Sign in with Telegram, choose **HackerRank** on `/feature` (or open
`/feature?platform=hackerrank`), and register one public username until revocation. It works independently
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

| Method | Endpoint                                                         | Purpose                                                  |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/tracking/hackerrank`                                       | Own registration and report status                       |
| POST   | `/api/tracking/hackerrank`                                       | Register with username and explicit agreement acceptance |
| GET    | `/api/hackerrank/[username]`                                     | Own cached calendar and saved counts                     |
| GET    | `/api/tracking/activity/day?platform=hackerrank&date=YYYY-MM-DD` | Own saved problem links for an IST day                   |

All endpoints require sign-in; progress and day details require the matching opt-in.
Responses disable caching, and registration requires a matching Origin. Saved day
selection never calls HackerRank. Telegram authentication returns to the selected
HackerRank feature after success or failure.

## Optional Codeforces feature

Sign in with Telegram and choose **Codeforces** on `/feature`, or open
`/feature?platform=codeforces`. Register your own public handle with the shared
agreement. The handle is reserved case-insensitively until revocation; public
lookup checks existence, not ownership. No Codeforces password or API key is used.

Registration immediately makes the Codeforces activity panel available on
Dashboard. The panel reuses the shared calendar, saved-day problem links,
loading/error/retry behavior, and service-management controls. It shows saved
unique problems, today's and this week's unique problems, and current/max rating
when available. Unrated profiles remain unrated rather than displaying a fabricated
zero rating. Problem difficulty badges retain Codeforces' numeric ratings.

### Official data and coverage

- `GET https://codeforces.com/api/user.info?handles=HANDLE` checks the canonical
  handle and retrieves available public ratings.
- `GET https://codeforces.com/api/user.status?handle=HANDLE&from=1&count=1000`
  retrieves submission metadata. The importer follows up to five pages per check,
  so a check scans at most 5,000 submissions, including unsuccessful attempts.
- Only Accepted submission metadata is saved. Contest/problem identifiers build
  links on Codeforces' own origin, including Gym and acmsguru problems. Source code,
  private groups, and problem statements are not imported.
- Accepted submission IDs preserve repeated solves. Calendar counts deduplicate
  the same problem within each IST day; weekly recaps and saved-unique totals
  deduplicate over their own periods. Re-solves on different days remain visible.
- The calendar distinguishes known coverage, partial days, and unavailable older
  history. Reaching the page bound does not establish a lifetime total. Delayed
  judgments, later rejudging, renamed handles, and unavailable upstream data can
  affect what a subsequent check sees. Saved observations remain available when a
  refresh fails.

The [official API documentation](https://codeforces.com/apiHelp?locale=en) limits
calls to one every two seconds. A database-coordinated request gate spaces calls
across application instances, including registration, dashboards, and cron work.
Account refreshes are cached for five minutes, with bounded request timeouts and
retry backoff. Pagination is bounded to keep dashboard and bot work finite.

### Daily Grind and lifecycle

Codeforces uses the existing Daily Grind connection, nightly collection,
daily/weekly recap schedules, recovery jobs, prepared-message retries, and
generation fencing. A Codeforces-only registration can connect the bot; adding
Codeforces to an already connected account needs no new bot credentials.

Pause hides its panel and cancels unsent recaps while collection continues.
Resume reveals retained history and enables future recaps without replaying missed
periods. Telegram `/stop` and `/start` control delivery for the whole account.
**Revoke & delete data** removes Codeforces submissions, snapshots, refresh state,
goals, deliveries, collection jobs, and consent without removing other services,
Notes, the Telegram connection, or the shared reminder ledger. Re-registration
creates a fresh generation and requires consent again.

Apply `0012_codeforces_tracking.sql` before deploying. It adds explicit Codeforces
storage, immutable account reservation, lifecycle triggers, platform constraints,
and the shared upstream rate gate. No new environment variable is required.

| Method       | Endpoint                                                         | Behavior                                                          |
| ------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET/POST     | `/api/tracking/services/codeforces`                              | Own status / register with current agreement                      |
| PATCH/DELETE | `/api/tracking/services/codeforces`                              | Pause/resume / revoke using the current registration ID           |
| GET/POST     | `/api/tracking/codeforces`                                       | Thin aliases of status / registration                             |
| GET          | `/api/codeforces/[username]`                                     | Own registered handle's saved progress and bounded refresh        |
| GET          | `/api/tracking/activity/day?platform=codeforces&date=YYYY-MM-DD` | Own saved Accepted problem links for an IST day                   |
| GET/PUT      | `/api/tracking/goal`                                             | Own Codeforces weekly target, selected with `platform=codeforces` |

Private responses are `no-store`; registration and management require the same
session/Origin checks as the other services. Day selection reads saved records
without contacting Codeforces. The public LeetCode lookup API and original query
bot keep their existing contracts.
