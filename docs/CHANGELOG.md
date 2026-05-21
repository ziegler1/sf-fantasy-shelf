# Changelog

## [0.8.0] — 2026-05-20 — Railway production deployment

### Added
- `backend/src/migrate.ts` — auto-runs SQL migrations on every backend startup; tracks applied files in a `_migrations` table so each runs exactly once (same pattern as cheers-mate's alembic upgrade head)
- `frontend/nginx/docker-entrypoint.sh` — proper shell script for envsubst so `$BACKEND_URL` substitutes correctly (inline CMD approach in Dockerfile caused shell expansion issues)

### Changed
- `backend/Dockerfile` — CMD now runs `node dist/migrate.js && node dist/index.js`; copies `db/` folder into image; switched `npm ci` → `npm install` (Railway sends full repo root as Docker build context, not the subdirectory)
- `frontend/Dockerfile` — same `npm ci` → `npm install` fix; uses entrypoint script instead of inline CMD
- Both Dockerfiles updated to use explicit subdirectory paths (`COPY backend/...`, `COPY frontend/...`) since Railway always uses repo root as build context regardless of Root Directory setting
- `frontend/nginx/nginx.conf` — added `proxy_ssl_verify off`, `proxy_ssl_server_name on`, `proxy_set_header Host $proxy_host` to fix 502 when nginx proxies to Railway's HTTPS backend URL
- `backend/src/routes/books.ts` — shelf upsert updated to `ON CONFLICT (user_id, book_id)` and inserts `user_id = 1` explicitly
- `backend/src/routes/authors.ts` — follow upsert updated to `ON CONFLICT (user_id, author_id)` and inserts `user_id = 1` explicitly
- `backend/src/migrate.ts` — migration list includes 001, 002, 003 in order

### Railway gotchas discovered
- Railway does NOT auto-inject `DATABASE_URL` from the Postgres plugin — must be copied manually from Postgres → Variables into the backend service Variables
- Railway always sends the full repo root as Docker build context even when Root Directory is set to a subdirectory — Dockerfiles must use explicit paths like `COPY backend/package*.json ./`
- nginx proxying to Railway HTTPS public URL requires `proxy_ssl_verify off` and `proxy_set_header Host $proxy_host` — without these you get 502
- Private networking (which would solve the proxy issue cleanly) is not available on Railway Hobby plan

### Production URLs
- Frontend: `https://sf-fantasy-shelf-production.up.railway.app`
- Backend: `https://backend-production-37fc.up.railway.app`

---

All notable changes to SF Fantasy Shelf are documented here.
Format: `[version] — date — summary`

---

## [0.7.0] — 2026-05-20 — Railway deployment prep

### Changed
- `frontend/nginx/nginx.conf` — replaced hardcoded `http://backend:3000` with `${BACKEND_URL}` template variable
- `frontend/Dockerfile` — CMD now runs `envsubst` at startup to inject `$BACKEND_URL` before starting nginx; config stored as `.template` file
- `frontend/src/app/core/services/claude.service.ts` — reverted base URL from hardcoded `http://localhost:3000/api/claude` back to relative `/api/claude`

### Added
- `frontend/.env.example` — documents `BACKEND_URL` with local and Railway example values
- `docs/` folder — ARCHITECTURE.md, SETUP.md, CHANGELOG.md, ROADMAP.md (this session)

---

## [0.6.0] — 2026-05-20 — Claude AI integration

### Added
- `backend/src/routes/claude.ts` — three endpoints using `@anthropic-ai/sdk`:
  - `POST /api/claude/summary` — fetches BookWithDetails, generates 2-3 paragraph SFF summary
  - `POST /api/claude/next` — fetches user's reading history, returns 3 personalised "what to read next" picks
  - `POST /api/claude/similar-authors` — given author_id, returns 3 authors with similar style/themes
- `frontend/src/app/core/services/claude.service.ts` — typed Angular service (`getBookSummary`, `getNextRecommendations`, `getSimilarAuthors`)
- `frontend/src/app/features/discover/discover.component.html` — full Discover page with "What to Read Next" + "Authors You Might Enjoy" sections
- `frontend/.env.example`

### Changed
- `backend/package.json` — added `@anthropic-ai/sdk ^0.54.0`
- `backend/src/index.ts` — registered `/api/claude` router
- `backend/.env.example` — added `ANTHROPIC_API_KEY`
- `frontend/src/app/features/library/library.component.ts` — added per-book AI summary toggle with `Map<number, SummaryState>`
- `frontend/src/app/features/library/library.component.html` — added "AI Summary" button and expandable summary panel per book card
- `frontend/src/app/features/discover/discover.component.ts` — replaced placeholder with full implementation

### Design decisions
- All three Claude routes use `stream.finalMessage()` to avoid HTTP timeouts on longer responses
- System prompts use `cache_control: { type: 'ephemeral' }` — repeated calls within 5 min hit the cache at ~10% input cost
- JSON responses from `/next` and `/similar-authors` use a regex fallback (`extractJson`) in case Claude adds preamble text

---

## [0.5.0] — 2026-05-20 — Angular Material UI

### Added
- `@angular/material ^17.3.0`, `@angular/cdk ^17.3.0` to frontend dependencies
- `frontend/src/app/core/layout/` — sidebar layout component (240px fixed on desktop, hamburger overlay on mobile), `BreakpointObserver` for responsive behaviour
- `frontend/src/app/core/services/book.service.ts` — full CRUD + `updateShelf`, `removeFromShelf`
- `frontend/src/app/core/services/author.service.ts` — full CRUD + `follow`/`unfollow`
- `frontend/src/app/core/services/series.service.ts` — full CRUD
- `frontend/src/app/features/library/` — book card grid, status filter chips, cover image/placeholder, star ratings, tag chips
- `frontend/src/app/features/series-tracker/` — series list with progress bars; uses `forkJoin` to cross-reference reading status from `/api/books`
- `frontend/src/app/features/discover/` — placeholder (upgraded in v0.6)
- `frontend/src/app/features/upcoming/` — placeholder
- `frontend/src/app/features/news/` — placeholder
- `frontend/angular.json` — added `@angular/material/prebuilt-themes/purple-green.css`
- `frontend/src/index.html` — added Material Icons and Roboto font links

### Changed
- `frontend/src/app/app.config.ts` — added `provideAnimationsAsync()`
- `frontend/src/app/app.routes.ts` — full route tree with `LayoutComponent` as shell, lazy-loaded feature components
- `frontend/src/styles.css` — dark theme overrides, status badge classes, empty-state styles

### Removed
- `frontend/src/app/shelf/` — replaced by the new library feature component

---

## [0.4.0] — 2026-05-20 — Multi-user foundation

### Added
- `backend/db/003_add_users.sql`:
  - `CREATE TABLE users (id, email, name, password_hash, created_at)`
  - Seed row `(id=1, 'local@localhost', 'Local User')` — existing data stays intact
  - `ALTER TABLE user_books ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users`
  - `ALTER TABLE author_follows ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users`
  - Replaced `UNIQUE (book_id)` with `UNIQUE (user_id, book_id)` on `user_books`
  - Replaced `UNIQUE (author_id)` with `UNIQUE (user_id, author_id)` on `author_follows`

### Changed
- `backend/src/types.ts` — added `User` interface (with `password_hash`), `user_id: number` to `UserBook` and `AuthorFollow`
- `frontend/src/app/types/schema.types.ts` — added `User` interface (without `password_hash`), same `user_id` additions

### Design decisions
- `DEFAULT 1` on both columns means zero data migration — all existing rows belong to the seed user
- Auth routes (JWT, login, register) are **not** built yet — this is schema-only groundwork
- Single-user behaviour is completely unchanged

---

## [0.3.0] — 2026-05-20 — TypeScript backend with full API

### Added
- `backend/tsconfig.json` — CommonJS target, `outDir: dist/`, `rootDir: src/`
- `backend/src/db.ts` — single pg `Pool` (max 10 conns, idle/connect timeouts)
- `backend/src/types.ts` — mirrors `schema.types.ts`
- `backend/src/lib/asyncHandler.ts` — wraps async Express routes
- `backend/src/lib/r2.ts` — `uploadCover` / `deleteCover` via `@aws-sdk/client-s3`
- `backend/src/middleware/errorHandler.ts` — global error handler
- `backend/src/routes/books.ts` — full CRUD + `/shelf` upsert/delete; enriched `BookWithDetails` from single aggregated SQL query
- `backend/src/routes/authors.ts` — full CRUD + follow/unfollow; returns `AuthorWithBooks`
- `backend/src/routes/series.ts` — full CRUD; returns `SeriesWithBooks` ordered by position
- `backend/src/routes/uploads.ts` — multipart upload to R2 (multer 2.x, 5MB limit, images only)
- `frontend/src/app/types/schema.types.ts` — complete schema types for frontend

### Changed
- `backend/package.json` — TypeScript deps, `@aws-sdk/client-s3`, `multer 2.x`, `tsx` for dev
- `backend/Dockerfile` — two-stage build (compile TS, then run dist/)
- `backend/.env.example` — added R2 variables
- `backend/src/index.ts` — replaced `index.js`, registered all routers
- Deleted `backend/src/index.js` and `backend/src/routes/books.js`

### Design decisions
- All list/detail endpoints for books, authors, and series use a single SQL query with `jsonb_agg` + `DISTINCT` + `FILTER (WHERE ... IS NOT NULL)` — no N+1 queries
- `books GET /?status=&search=` supported as optional filters
- `user_books` upsert uses `ON CONFLICT (book_id) DO UPDATE` — idempotent

---

## [0.2.0] — 2026-05-20 — Full database schema

### Added
- `backend/db/002_full_schema.sql`:
  - Drops stub `books` table (with data migration)
  - Creates: `authors`, `series`, `tags`, `news_sources`, `books`, `book_authors`, `book_series`, `book_tags`, `user_books`, `news_articles`, `upcoming_releases`, `author_follows`
  - Migrates data from stub table: author text → `authors` + `book_authors`, genre text → `tags` + `book_tags`, status → `user_books`
  - All tables in a single `BEGIN/COMMIT` transaction

### Changed
- `frontend/src/app/types/schema.types.ts` — full schema types (previously only `Book` + `UserBook`)

### Design decisions
- `user_books.book_id` has a `UNIQUE` constraint (single-user at this stage; replaced by `(user_id, book_id)` in v0.4)
- `book_series.position` is `NUMERIC` (not integer) to support half-positions like 1.5
- `user_books.status` uses a `CHECK` constraint rather than a Postgres enum — avoids `ALTER TYPE ADD VALUE` locking issues on Railway rolling deploys (lesson from cheers-mate)
- `upcoming_releases.book_id` is nullable (an upcoming book may not yet be in the `books` table)

---

## [0.1.0] — 2026-05-20 — Monorepo scaffold

### Added
- Git repository initialised
- `.gitignore` — Node, Angular, Postgres patterns
- `README.md` — stack table, monorepo layout, getting-started guide, Railway deploy notes
- `package.json` (root) — `install:all`, `dev:frontend`, `dev:backend`, `build` scripts
- `frontend/` — Angular 17 standalone app scaffold:
  - `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`
  - `proxy.conf.json` — proxies `/api` and `/health` to port 3000
  - `src/main.ts`, `src/app/app.component.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`
  - `src/index.html`, `src/styles.css`
  - `nginx/nginx.conf` — SPA fallback, `/api` proxy, asset caching, gzip
  - `Dockerfile` — multi-stage Angular build → nginx serve
- `backend/` — Node/Express plain-JS scaffold (upgraded to TS in v0.3):
  - `package.json`, `src/index.js`, `src/routes/books.js`
  - `.env.example`, `Dockerfile`
  - `db/001_init.sql` — stub books table
