# Changelog

## [0.16.0] — 2026-05-23 — Mobile UX polish: covers, series tracker, light mode

### Fixed

- **Cover images — no more bands or cropping**: All cover containers now use `width: 100%; height: auto` (no forced aspect-ratio). Images display at their native proportions. Applies across every component: library (all 4 views), book-detail dialog, add-book search results, upcoming releases, add-upcoming dialog, series tracker thumbnails. Placeholders retain `aspect-ratio: 2/3` as fallback.
- **By Author sort**: books within each author group now sort by series position when two books share the same series, then alphabetically by series name / standalone title. Leading articles ("The", "A", "An") are stripped for sort key only. Previously was pure alphabetical-by-title, which scattered series books across the list.
- **Author name deduplication**: `normalizeAuthor()` collapses spaces after consecutive initials — "C. S. Friedman" and "C.S. Friedman" now merge into a single author group in the By Author view.
- **Light mode — dialog panel**: `.mat-mdc-dialog-surface` now forces `color: #1e293b` so all text inside the book-detail dialog is readable (previously white text on light background).
- **Light mode — mat-select dropdown**: The status picker ("Not on Shelf / Reading / Read / DNF") renders in a CDK overlay; now gets an explicit gray background and dark option text.
- **Light mode — filter buttons + search field**: Added direct `.mdc-text-field__input`, `.mdc-button__label`, and `border-color` overrides with `!important` since CSS variable changes don't win against the prebuilt dark Material theme.
- **Light mode — status badges**: Opacity raised to 0.20 and text colors deepened (forest green, navy, deep purple, dark red) for contrast on gray surfaces.
- **Light mode — background**: `--bg-base` changed to `#dde3eb` and `--bg-surface` to `#edf1f7` — clearly gray instead of near-white.

### Changed

- **Series tracker panels** (further compacted): card padding `0.45rem`, progress bar `3px`, entry padding `0.1rem`, thumbnail shrunk to `22px` wide, "read" stat label removed. Each panel now takes roughly half the vertical space of the original.

---

## [0.15.0] — 2026-05-23 — Phase 5 UX: view modes, dark/light mode, pagination

### Added

- **Library view modes**: four selectable display modes with icons in a toggle group (persisted to localStorage):
  - *Grid* — 2-column compact covers on mobile, auto-fill on desktop
  - *Shelf* — medium tiles (170px min) showing cover + title + author + status
  - *List* — single rows with 40px thumbnail, title, author, status badge, chevron
  - *By Author* — collapsible author groups; books sorted by series position then title
- **Dark/light mode toggle**: `ThemeService` with `signal<boolean>`, `localStorage` persistence, `body.light-theme` CSS class. Toggle button in sidebar footer. Comprehensive CSS custom property system (19 tokens) across all components plus Angular Material MDC overrides for nav items, toolbar, cards, dialogs, buttons, and text fields.
- **Pagination**: `GET /api/books` now returns `{ books: BookWithDetails[]; total: number }` with `limit` / `offset` query params (max 200). `BookService.getBooks()` updated; library shows prev/next controls when `totalPages > 1`. PAGE_SIZE set to 200 to support By Author grouping on typical personal libraries.

### Changed

- `backend/src/routes/books.ts` — `booksQuery()` accepts optional `limit?` / `offset?`; handler runs book query and COUNT query in parallel with `Promise.all`
- `frontend/src/app/core/services/book.service.ts` — `getBooks()` return type updated to `{ books; total }`
- `frontend/src/app/features/series-tracker/series-tracker.component.ts` — updated to pass `{ limit: 200 }` and destructure the new response shape

---

## [0.14.0] — 2026-05-23 — Zod input validation

### Added

- `backend/src/lib/validate.ts` — `validate(schema)` Express middleware; also exports `requiredStr`, `nullableStr`, `readingStatus` Zod helpers
- Zod schemas and `validate()` middleware on every POST/PUT route: auth, books, authors, series, upcoming, claude

### Changed

- `backend/src/routes/auth.ts` — `profileSchema` uses `.refine()` to enforce at least one field; manual `if (!field)` guards removed
- `backend/src/routes/books.ts` — `shelfUpdateSchema` replaces manual status enum check; `importSchema` uses `.default([])` for authors array
- `backend/src/routes/claude.ts` — `book_id` / `author_id` now typed as `z.number().int().positive()`; no more `Number()` coercions inside handlers

### Notes

- No visible behaviour change for valid requests — validation only affects malformed input (now returns 400 with field-level detail instead of 500 or silent bad insert)

---

## [0.13.0] — 2026-05-23 — News feed, series fixes, rate limiting

### Added

- `backend/db/008_news_articles.sql` — `news_articles` table (id, source_name, title, url, description, image_url, published_at, created_at); unique index on url
- `backend/db/009_news_patch.sql` — patch migration adding `source_name` column and fixing multi-column index (COALESCE functional index caused silent migration failure)
- `backend/db/010_news_columns.sql` — patch migration adding `description`, `image_url`, `published_at` columns missing due to earlier migration abort
- `backend/src/lib/fetchNewsFeeds.ts` — RSS fetcher using `rss-parser`; extracts images from `media:content`, `media:thumbnail`, `content:encoded`; truncates descriptions to 400 chars plain text; prunes articles older than 90 days before each fetch
- `backend/src/routes/news.ts` — `GET /api/news` (paginated, ordered by published_at), `POST /api/news/refresh` (manual trigger)
- `frontend/src/app/core/services/news.service.ts` — `NewsService` with `getArticles()` and `refresh()`
- `frontend/src/app/features/news/news.component.ts` — card grid with source filter chips, per-source colour badges, 90-day rolling display; refresh button shows per-source result pills (green = ok, red = error)
- `backend/src/index.ts` — `node-cron` job runs `fetchNewsFeeds()` every 4 hours; also fires once on startup

### Changed

- `backend/src/routes/claude.ts` — separate rate limit for `series-detect` (100/hr) vs heavy endpoints (20/hr); series-detect fires on every book pick so needs its own budget
- `backend/src/routes/books.ts` — fixed ISBN early-return path: when a book already exists by ISBN, now correctly finds/creates the series link, upserts `user_books`, commits, returns the book, and triggers `populateSeriesBooks` in the background (previously did ROLLBACK and returned without any of this)

### Feed sources

- Tor.com, Locus Magazine, SFF World, The Wertzone
- Reddit SFF/Fantasy removed — returns 403 without OAuth

### Retention policy

- Articles older than 90 days are deleted at the start of each `fetchNewsFeeds()` run (no archiving — deliberate, keeps the DB small)

### Migration gotcha

- Multi-statement SQL in a single migration file: if an intermediate statement fails, earlier statements are already auto-committed but the `_migrations` record is never written — so the migration re-runs on next deploy, hitting "column already exists" errors. Fix: keep migrations idempotent (`ADD COLUMN IF NOT EXISTS`) or split into separate files.

---

## [0.12.0] — 2026-05-23 — Upcoming releases

### Added

- `backend/src/routes/upcoming.ts` — `GET /api/upcoming`, `POST /api/upcoming`, `DELETE /api/upcoming/:id`; background job downloads cover to R2 and patches the row with the R2 URL
- `frontend/src/app/features/upcoming/upcoming.component.ts` — timeline list grouped by month; empty state; delete with confirm
- `frontend/src/app/features/upcoming/add-upcoming-dialog.component.ts` — Google Books search + manual entry fallback; populates title, author, date, ISBN, cover
- `frontend/src/app/core/services/upcoming.service.ts`

---

## [0.11.0] — 2026-05-22 — Claude series detection + series population

### Added

- `POST /api/claude/series-detect` — given title + author, returns `{ series_name, series_position }` using Claude; used automatically when a book is picked in the add-book flow
- `backend/src/lib/populateSeriesBooks.ts` — after importing a book that belongs to a series, fetches all sibling books from Google Books and pre-inserts them (no `user_books` row — they appear in Series Tracker as unowned, greyed out)
- Gap-fill logic: if a series already exists in DB, checks for missing position slots and back-fills them

### Changed

- `frontend/src/app/features/library/add-book/add-book.component.ts` — calls `series-detect` on every book selection; pre-fills series name + position fields; shows series chip in search results
- `backend/src/routes/books.ts` — `POST /import` triggers `populateSeriesBooks` in background after commit

### Design decisions

- Series population runs fire-and-forget (`setImmediate` / `.catch()`); import response is not delayed
- Dedup: `INSERT … ON CONFLICT DO NOTHING` on both `books` (by isbn13) and `book_series` (by book_id + series_id)
- "The " prefix normalisation: series lookup uses `REGEXP_REPLACE(LOWER(name), '^the\s+', '')` so "The Wheel of Time" and "Wheel of Time" resolve to the same record

---

## [0.10.0] — 2026-05-21 — Book detail dialog + metadata editing

### Added

- `frontend/src/app/features/library/book-detail/book-detail.component.ts` + HTML — full book detail dialog:
  - Header: cover, title, authors, year/pages/ISBN pills, series line, tags
  - Inline shelf editing: status dropdown + 5-star rating (auto-saves on change)
  - AI Summary section: shows cached summary or "Generate" button
  - Publisher description section
  - Reading notes + dates (started/finished)
  - Per-author section: avatar, bio, website, "other books" thumbnail grid
  - Delete book with confirm step
- **Metadata edit mode** (pencil icon): edits **Title, Year, Pages, ISBN-13, Description** — calls `PUT /api/books/:id`; cover image, authors, and series position are *not* editable in this UI

### Changed

- `frontend/src/app/features/library/library.component.ts` — book card click opens `BookDetailComponent` dialog
- `backend/src/routes/books.ts` — `GET /api/books` filters to `ub.id IS NOT NULL` so auto-populated series siblings don't appear in My Library

---

## [0.9.0] — 2026-05-21 — Authentication (Phase 1)

### Added

- `backend/db/003_add_users.sql` — `users` table; seed row (id=1, password_hash=''); `user_id` FK on `user_books` and `author_follows`; unique constraints updated to `(user_id, book_id)` / `(user_id, author_id)`
- `backend/src/middleware/auth.ts` — `signToken` / `verifyToken` (30-day JWT, HS256, `req.userId` set on every protected request)
- `backend/src/routes/auth.ts` — register (bcrypt 12 rounds, claims seed user on first registration), login, `GET /me`, `PUT /profile`, `POST /change-password`
- `frontend/src/app/core/services/auth.service.ts` — login/register/logout/updateProfile/changePassword; 30-day JWT stored in localStorage
- `frontend/src/app/core/interceptors/auth.interceptor.ts` — attaches Bearer token; auto-logout on 401
- `frontend/src/app/core/guards/auth.guard.ts` — redirects unauthenticated users to `/login`
- `frontend/src/app/features/auth/login/` and `register/` — full form pages
- `frontend/src/app/features/account/account.component.ts` — edit profile, change password, sign out
- `docs/AUTH.md`

### Design decisions

- First `POST /register` call when `password_hash = ''` exists claims the seed row (id=1) rather than inserting a new user — all existing shelf data transfers automatically with no migration
- Subsequent registrations insert new rows normally
- All routes use `req.userId` — hardcoded `user_id = 1` fully removed

---

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
