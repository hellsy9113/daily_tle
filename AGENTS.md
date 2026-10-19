<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Architecture

- Read `docs/features.md` before adding or changing an opt-in service.
- `lib/features/catalog.ts` contains browser-safe metadata; server adapters and
  batched status live beside it. Keep domain clients, data, and reports local.
- Feature owns registration, pause/resume, and deletion. Dashboard and Profile
  link to Feature for management; Profile owns theme and sign-out.
- Preserve generation/lease fencing, account-first lock order, consent, and
  per-service transactional deletion. Database details are in `docs/tracking.md`.
- Run `npm run check`, `npm run build`, and isolated `npm run test:db` after lifecycle changes.
