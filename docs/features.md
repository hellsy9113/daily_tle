# Add an opt-in feature

The shared workflow is sign in → register → use → pause/resume → revoke and delete.
Keep common behavior here and feature-specific behavior in the feature's domain modules.

Feature cards open registration and management in a modal dialog. Existing
`/feature?platform=…` links open the same dialog; closing it returns to the catalog.
Dashboard navigation contains Activity and, for registered notebooks, Notes.
Coding-platform activity remains together under Activity.

## Where to change

1. Add browser-safe metadata to `lib/features/catalog.ts`: ID, labels, description,
   coverage, and optional dashboard/calendar/recap capabilities. IDs and management links derive
   from this catalog. Do not import database or upstream modules into it.
2. Implement the service in its own domain folder. Validate registration input and
   upstream data there; keep its storage and report formatting local.
3. Add its server adapter in `lib/features/server.ts`: input/consent parsing, register,
   status, pause, revoke. The parser is an adapter slot; other services can validate
   their own payloads without requiring the existing username contract.
   Existing username services use `registerFeature` for atomic reservation, initial
   import, and agreement recording. Services with different setup requirements supply
   their own validated registration adapter rather than forcing a username form.
4. Add its Setup component and optional Dashboard component to
   `components/feature-views.tsx`. The shared Feature page renders the selected Setup
   slot; that component owns its form and consent. Dashboard panels render only for
   registered, unpaused services. A feature need not provide a calendar or recaps.
5. If the service collects daily activity, add its collector to
   `lib/tracking/reports.ts` and persistence to the result store. Collection and delivery
   recovery share this preparation; Telegram scheduling remains in the dispatcher.

## Storage is explicit

This refactor preserves the existing schema: username reservations and registration
timestamps are account columns; triggers create generation records in
`platform_services`. Adding a service still requires an additive migration for its
storage, constraints, and triggers, plus its mapping in `lib/tracking/platforms.ts`.
The catalog does not create database storage. A service with different data needs
must define its own storage and account-owned status. Extend the shared status/form
interfaces when that service is implemented; do not add speculative nullable fields now.

Notes is a non-activity feature: its notebook ID is its registration generation,
registration timestamps live on the account, and pause state lives on the notebook.
It supplies its own adapter, code form, status, and transactional revocation. It does
not join `platform_services`, daily collection, recaps, or activity clients. Use
`ActivityFeatureId`/`activityFeatureIds` where activity storage is required; use
`FeatureId` for feature navigation. Notes registration uses `{ code }` rather than
the coding-platform username/consent body. See [Notes](notes.md).

## HTTP contract

`/api/tracking/services/[platform]` supports GET status, POST registration, PATCH
pause/resume, and DELETE revocation. The existing `/api/tracking`,
`/api/tracking/gfg`, `/api/tracking/hackerrank`, and `/api/tracking/codeforces`
registration URLs are aliases.
Existing POST bodies require `{ username, agreementVersion: "1", acceptedAgreement: true }`.
PATCH requires `{ registrationId, paused }`; DELETE requires
`{ registrationId, confirmPermanentDeletion: true }`.
All private responses are `no-store`; mutations require the session and matching Origin.

## Lifecycle invariants

- Registration reserves an immutable identity and records explicit current consent.
- Lock the account before registration/sync/delivery state; recheck generation and
  lease after upstream work. Stale mutations return 409.
- Pause hides activity and cancels unsent recaps; daily collection continues.
  Resume reveals retained data and enables future recaps without replaying missed days.
- Revocation atomically removes that service's data and generation. Other services,
  account, Telegram connection, sessions, and shared reminder ledger remain intact.
- Re-registration requires fresh consent and creates a fresh generation. Late work
  from the revoked generation cannot save results or send another report part.
- Telegram `/stop` and `/start` control account-wide delivery independently of service pause.

## Verify

Cover setup/consent, pause/resume, deletion/cancellation/retry, re-registration, stale
requests, account isolation, and optional capabilities. Preserve public API and both
bot contracts. Use the shared resource hook for cancellation and retained results;
Dashboard receives initial status without a duplicate hydration request. Batch status
reads once for the requested services. Run `npm run check`, `npm run build`, and
`npm run test:db` against an isolated test database.
