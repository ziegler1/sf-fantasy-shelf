# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project

**Zig's Codex** (`sf-fantasy-shelf`) — a personal SFF book-tracking web app.
Angular 17 (standalone) + Express/TypeScript + PostgreSQL, deployed on Railway.
Multi-user with invite-code registration + admin email approval.

## Commands

```bash
npm run install:all      # install both frontend and backend deps
npm run dev:backend       # tsx watch src/index.ts — port 3000
npm run dev:frontend       # ng serve — port 4200, proxies /api -> :3000 via proxy.conf.json
npm run build              # build:backend (tsc) then build:frontend (ng build)
npm run build:backend      # tsc -> backend/dist
npm run build:frontend     # ng build
```

No test suite exists yet.

## Architecture

Full route tables, DB schema, and deployment topology live in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Highlights:

- **Backend routers** (`backend/src/routes/`): `auth`, `books`, `authors`, `series`,
  `uploads`, `claude`, `search`, `toppicks`, `upcoming`, `news`, `logs`.
- **Auth**: `verifyToken` middleware (`backend/src/middleware/auth.ts`) sets `req.userId`
  on every protected route. Public routes: `/api/auth/*`, `/api/search`, `/api/toppicks*`,
  `/api/logs/errors`.
- **Migrations**: `backend/db/*.sql`, run automatically on startup via `migrate.ts`,
  tracked in a `_migrations` table (each runs exactly once). **Never edit an
  already-applied migration** — add a new numbered file. Multi-statement migrations
  must be idempotent (`ADD COLUMN IF NOT EXISTS`) — see the 008/009/010 gotcha in
  [docs/CHANGELOG.md](docs/CHANGELOG.md).
- **Mirrored types**: `backend/src/types.ts` and `frontend/src/app/types/schema.types.ts`
  — keep in sync when changing the schema (frontend omits `password_hash`).
- **AI**: Claude Sonnet 4.5 via `@anthropic-ai/sdk` for book summaries, "what to read
  next", similar authors, and series detection (`backend/src/lib/generateSummary.ts`,
  `backend/src/routes/claude.ts`). All Claude routes are rate-limited.
- **External APIs**: Google Books (primary) with OpenLibrary fallback for search,
  cover lookup, and series population (`backend/src/lib/extractSeries.ts`,
  `backend/src/lib/populateSeriesBooks.ts`, `backend/src/lib/downloadAndStoreCover.ts`).
- **Email**: Resend API (`backend/src/lib/email.ts`) for approval requests, welcome
  emails, and password resets.
- **Error logging**: frontend `LoggingService` + `GlobalErrorHandler` +
  `authInterceptor` POST to `/api/logs/errors`, which logs to stdout for Railway to
  capture (no external error-tracking service).

## Environment variables (`backend/.env`)

| Var | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Signs 30-day auth JWTs |
| `INVITE_CODE` | Yes | Must match on `/api/auth/register` |
| `ANTHROPIC_API_KEY` | Optional | Enables AI summaries / recommendations / series-detect |
| `GOOGLE_BOOKS_API_KEY` | Optional | Book search & series population (falls back to OpenLibrary without it) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | Optional | Cloudflare R2 cover image storage |
| `RESEND_API_KEY` | Optional | Sends approval/welcome/reset emails |
| `ADMIN_EMAIL` | Optional | Recipient for new-user approval requests |
| `FROM_EMAIL` | Optional | Sender address (defaults to `onboarding@resend.dev`) |
| `APP_URL` | Optional | Used to build links in emails (defaults to `http://localhost:4200`) |
| `PORT` | Optional | Defaults to 3000 |

Frontend (`frontend/.env`): `BACKEND_URL` only — injected into nginx via `envsubst` at
container startup. Angular services always call relative `/api/...` paths.

## Auth & approval model

- Single global `INVITE_CODE` required to register.
- First registrant claims the seed user (id=1) and becomes `active` immediately.
- Subsequent registrants are inserted with `status='pending'`; an approval email goes
  to `ADMIN_EMAIL` with a link to `GET /api/auth/approve` (no admin UI — email-link only).
- Pending users get a 403 on login until approved.
- Password reset: `POST /api/auth/forgot-password` emails a 1-hour token
  (`password_reset_tokens` table); `POST /api/auth/reset-password` consumes it.

## Key gotchas

- Railway does **not** auto-inject `DATABASE_URL` — copy it manually from the Postgres
  plugin into the backend service's variables.
- Railway always uses the repo root as the Docker build context regardless of the
  configured Root Directory — Dockerfiles `COPY backend/...` / `COPY frontend/...`.
- `user_books.status` is `VARCHAR` + `CHECK`, not a Postgres enum — avoids
  `ALTER TYPE ADD VALUE` lock issues on Railway rolling deploys.
- nginx proxying to Railway's HTTPS backend needs `proxy_ssl_verify off` and
  `proxy_set_header Host $proxy_host`, or you get 502s.
- Before deploying, run through the smoke-test checklist in
  [docs/SETUP.md](docs/SETUP.md#pre-deployment-smoke-tests).

## Docs map

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — routes, schema, deployment topology
- [docs/ROADMAP.md](docs/ROADMAP.md) — phase status and backlog
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — version history (entries currently go up to
  0.16.0 / 2026-05-23; a large amount of work — auth/approval, password reset,
  dashboard, analytics, search, top picks, featured book, cover retry, series
  population, error logging — has landed since but isn't logged yet)
- [docs/SETUP.md](docs/SETUP.md) — local setup, Railway deploy, smoke tests
- [docs/AUTH.md](docs/AUTH.md), [docs/R2_SETUP.md](docs/R2_SETUP.md) — feature-specific setup
- [docs/diagrams.md](docs/diagrams.md) — Mermaid feature map and flow diagrams
