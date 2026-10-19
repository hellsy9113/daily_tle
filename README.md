# Track.it

A Next.js app for independent opt-in services. It currently tracks LeetCode,
GeeksforGeeks, and HackerRank practice, with Telegram sign-in, saved activity,
and daily recaps. The public demo, lookup APIs, and separate command bot remain available.

## Private notes

Create private notes with up to 100 words and separate links at `/notes`. Signed-in
users have direct access; a registered secret code unlocks Notes only for 20 minutes
when signed out. Apply `0007_notes.sql` before deployment. See [Notes](docs/notes.md).

## Workflow

Sign in → choose a service on `/feature` → register with consent → use its dashboard.
Manage Pause/Resume and **Revoke & delete data** on the same Feature page.
Pause hides activity and stops recaps while collection continues; resume retains history.
Deletion clears only that service's saved data. Profile owns appearance and sign-out.
Connect Daily Grind once for all enabled services.
Weekly recaps for all three platforms are scheduled for Sunday at 11:00 p.m. IST,
covering Monday through that cutoff, with recovery at 11:30 p.m.

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Configure the environment and apply migrations before using authenticated tracking.
See [tracking setup](docs/tracking.md) for Telegram credentials and registration settings.

## Code map

- `lib/features/`: browser-safe catalog, server adapters, registration, batched status, HTTP handlers.
- `components/feature-views.tsx`: service-specific setup and optional Dashboard component slots.
- `lib/leetcode/`, `lib/gfg/`, `lib/hackerrank/`: upstream clients, validation, data, reports.
- `lib/tracking/`: generation locks, pause/deletion, collection, delivery, and tracking bot.
- `lib/auth/`, `lib/db/`, `lib/telegram/`: authentication, schema, and the independent command bot.
- `app/`: thin pages and API entry points; `tests/`: behavior and isolated database tests.

## Documentation

- [Notes](docs/notes.md): private notes, code registration, and 20-minute guest access.
- [Add a feature](docs/features.md): extension points, lifecycle rules, storage requirements.
- [Tracking](docs/tracking.md): setup, consent, pause/deletion, collection and delivery guarantees.
- [Platforms](docs/platforms.md): GFG/HackerRank APIs and public-history limitations.
- [Public API and command bot](docs/api.md): existing endpoints and bot setup.
- [Development and deployment](docs/development.md): environment, migrations, CI, and database tests.

## Validation

```bash
npm run check
npm run build
npm run test:db
```

Database tests create and drop an isolated `tracking_test_*` schema. Set
`TEST_DATABASE_URL` to a test PostgreSQL database; CI supplies PostgreSQL automatically.
Notes requires migration `0007_notes.sql`; weekly recaps require `0008_weekly_recaps.sql`.
No new environment variable is needed.
