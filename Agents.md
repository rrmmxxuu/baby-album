# Agent Guide

This file is for coding agents working in this repository. Read it before making changes.

## Project Summary

Baby Album is a self-hosted baby photo platform with three main parts:

- `apps/web`: Next.js 15 + React 19 mobile-first PWA
- `services/api`: Go control-plane API backed by PostgreSQL
- `services/agent`: Go NAS agent for originals storage and restore

Current user-facing focus areas:

- photo timeline and uploads
- onboarding, invites, RBAC, baby management
- baby-scoped routes
- feeding records
- storage node pairing and status

## Repository Layout

- `apps/web/app`: Next.js app routes
- `apps/web/components/app-shell`: main app shell, routes, feeding UI, settings UI
- `apps/web/components/upload-draft-sheet`: upload composer
- `apps/web/lib`: web API client and shared TS types
- `apps/web/e2e`: Playwright end-to-end tests
- `services/api/cmd/server`: API entrypoint
- `services/api/internal/httpapi`: HTTP handlers
- `services/api/internal/store`: PostgreSQL store and business rules
- `services/api/internal/domain`: core Go models
- `services/agent/cmd/agent`: NAS agent entrypoint and control panel
- `scripts/dev-up.sh`: local dev stack
- `scripts/dev-down.sh`: stop local dev stack
- `scripts/test-e2e.sh`: isolated browser test stack

## Current Route Model

Do not reintroduce the old route model.

Current route split:

- global routes:
  - `/`
  - `/auth`
  - `/welcome`
  - `/photos`
  - `/feeding`
  - `/settings`
  - `/settings/account`
  - `/settings/babies`
  - `/settings/babies/new`
- baby-scoped routes:
  - `/babies/:babyId/photos`
  - `/babies/:babyId/feeding`
  - `/babies/:babyId/manage`
  - `/babies/:babyId/manage/members/:memberId`
  - `/babies/:babyId/manage/storage`

Important rules:

- URL is the source of truth.
- Do not add a custom in-memory router.
- `settings` is global, not nested under a baby route.
- `/feeding` is a resolver page:
  - 0 eligible babies: empty state
  - 1 eligible baby: direct redirect to that baby
  - 2+ eligible babies: always require explicit selection
- entering feeding must not reuse the current photos baby when the user has more than one feeding-eligible baby

Main route files:

- `apps/web/components/app-shell/model/routes.ts`
- `apps/web/components/app-shell/routes/baby-route-shell.tsx`
- `apps/web/components/app-shell/routes/photos-hub-route.tsx`
- `apps/web/components/app-shell/routes/feeding-hub-route.tsx`
- `apps/web/components/app-shell/routes/baby-feeding-route.tsx`

## Feeding Module Notes

Main files:

- `apps/web/components/app-shell/routes/baby-feeding-route.tsx`
- `apps/web/components/app-shell/model/feeding.ts`
- `apps/web/app/styles/feeding.css`
- `services/api/internal/httpapi/feeding_handlers.go`
- `services/api/internal/store/postgres.go`
- `services/api/internal/store/feeding_test.go`

Current behavior that should be preserved unless intentionally changed:

- feeding summary is computed from current day entries
- feeding detail page hides the global bottom nav and uses its own floating action panel
- saving or deleting feeding entries updates local state first; do not re-fetch the whole day unless necessary
- unfinished breast-feeding entries can be saved without `endedAt`
- unfinished breast-feeding entries do not count toward summary metrics
- editing an unfinished breast-feeding or sleep entry pre-fills the end time with the current time
- new milk entries default to the last used milk mode for that baby

## Refresh and Polling Rules

Be conservative with background refresh.

Do not add passive global polling to authenticated pages.

Specifically:

- `useAppSession` must not reintroduce a periodic `auth/app` refresh loop
- feeding pages should not refetch every few seconds
- if local state can be updated deterministically after a mutation, prefer that over a full refresh

Allowed polling is only local and event-driven, for example:

- storage pairing status while pairing is active
- upload preview readiness while uploads are still processing
- original image polling after a user explicitly asks for the original

## Local Development

Recommended one-command dev start:

```bash
./scripts/dev-up.sh 192.168.31.200
```

Stop it with:

```bash
./scripts/dev-down.sh
```

Important local ports used by the normal dev stack:

- web: `3000`
- api: `8080`
- postgres: `5432` via `docker compose`

## Testing Commands

Frontend:

```bash
npm --prefix apps/web run typecheck
npm --prefix apps/web test
```

API:

```bash
cd services/api
GOCACHE=/Users/xuruimeng/baby-album/tmp/go-build go test ./...
```

Agent:

```bash
cd services/agent
GOCACHE=/Users/xuruimeng/baby-album/tmp/go-build go test ./...
```

## E2E Rules

Always prefer the isolated E2E stack.

Use:

```bash
./scripts/test-e2e.sh 127.0.0.1
```

This script is intentionally isolated from the normal dev stack and uses separate defaults:

- web: `3106`
- api: `18086`
- postgres: `15432`
- docker compose project: `baby-album-e2e`

Do not change E2E back to using the user’s normal dev ports or shared postgres.

The script already sets:

- `NEXT_PUBLIC_API_BASE_URL`
- `INTERNAL_API_BASE_URL`

so browser tests and the Next.js proxy stay on the isolated stack.

## UI and Styling Notes

- The app is mobile-first. Check narrow layouts first.
- Feeding UI is style-heavy and mostly lives in `apps/web/app/styles/feeding.css`.
- Keep bottom navigation on one row.
- When the feeding editor is open, the feeding action dock should be hidden.
- Avoid large layout jumps caused by unnecessary refreshes.

## Backend Notes

- Feeding persistence and summary logic are in `services/api/internal/store/postgres.go`
- HTTP validation is in `services/api/internal/httpapi/feeding_handlers.go`
- Shared contracts between web and API live in:
  - `apps/web/lib/types.ts`
  - `services/api/internal/domain/models.go`
  - `services/api/internal/store/store.go`

When changing API payloads, update both sides in the same change.

## Git and Local Files

Ignored local-only files include:

- `.agents/`
- `.skills/`
- `.skills`
- `skills-lock.json`
- `tmp/`

Do not commit local runtime files or agent-generated lock/state artifacts.

## Preferred Change Workflow

1. Read the relevant route, UI, and store files first.
2. Keep changes scoped to the feature you are touching.
3. Update shared types before wiring UI and backend together.
4. Prefer local deterministic state updates over broad refreshes.
5. Run targeted validation first, then broader validation if the change is user-visible.
6. If you touched routing, feeding, or session behavior, run the isolated E2E suite.

## Minimum Validation Before Commit

- web-only UI change:
  - `npm --prefix apps/web run typecheck`
  - `npm --prefix apps/web test`
- API/store change:
  - `GOCACHE=/Users/xuruimeng/baby-album/tmp/go-build go test ./...` in `services/api`
- routing, session, feeding, onboarding, or other user flow changes:
  - `./scripts/test-e2e.sh 127.0.0.1`

## Known Pitfalls

- Reintroducing global refresh loops causes visible page jumps.
- Using unstable function/object dependencies in client effects can retrigger fetches unexpectedly.
- Feeding summary rules are easy to drift between frontend and backend; keep them aligned.
- `/feeding` and `/babies/:babyId/feeding` have different responsibilities; do not merge them conceptually.
- `scripts/dev-down.sh` stops the normal local postgres; `scripts/test-e2e.sh` should only touch the isolated E2E stack.
