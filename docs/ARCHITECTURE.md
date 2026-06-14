# Zig's Codex — Architecture

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Angular 17 (standalone components) | Lazy-loaded routes, Angular Material M3 |
| Backend | Node.js 20 / Express 4 (TypeScript) | Compiled to `dist/`, runs in Docker |
| Database | PostgreSQL 16 | Runs in Docker locally, Railway plugin in prod |
| Serving | nginx 1.25 | Serves built Angular assets, proxies `/api/*` to backend |
| AI | Anthropic Claude (`claude-sonnet-4-5`) | via `@anthropic-ai/sdk`, streamed + system-prompt cached |
| Book data | Google Books API (OpenLibrary fallback) | Search, cover lookup, series population/gap-fill |
| Email | Resend | Approval requests, welcome emails, password resets |
| Storage | Cloudflare R2 | S3-compatible; cover image uploads (optional, already wired) |
| Deploy | Railway | Backend + Frontend as separate services; Postgres plugin |
| DNS/CDN | Cloudflare | CNAME proxy over Railway domain; R2 for object storage |

---

## Monorepo layout

```
sf-fantasy-shelf/
├── frontend/                   Angular app
│   ├── src/app/
│   │   ├── core/
│   │   │   ├── layout/         Sidebar shell (LayoutComponent)
│   │   │   ├── guards/         AuthGuard
│   │   │   ├── handlers/       GlobalErrorHandler → LoggingService
│   │   │   ├── interceptors/   authInterceptor (attaches JWT, logs HTTP errors, 401 logout)
│   │   │   └── services/       Book/Author/Series/Claude/News/Upcoming/Search/Auth/Theme/Logging
│   │   ├── features/
│   │   │   ├── dashboard/      Home — featured book, quick stats, recommended series, upcoming, top picks
│   │   │   ├── library/        My Library — grid/list/by-author/by-genre views, search, add/edit book
│   │   │   ├── series-tracker/ Series progress bars, populate series, add/remove books
│   │   │   ├── discover/       AI "what to read next", similar authors, restore deleted authors
│   │   │   ├── upcoming/       Upcoming releases timeline — add/edit/delete
│   │   │   ├── news/           RSS news feed — per-user source toggles, dismiss, refresh
│   │   │   ├── analytics/      Reading stats, charts, JSON library export
│   │   │   ├── account/        Profile, change password, theme/accent picker
│   │   │   └── auth/           Login, register, forgot/reset password
│   │   └── types/
│   │       └── schema.types.ts Shared DB types (mirrors backend/src/types.ts)
│   ├── nginx/nginx.conf        Uses $BACKEND_URL envsubst variable
│   ├── Dockerfile              Build: node:20 → Serve: nginx:1.25
│   └── proxy.conf.json         Dev proxy: /api → localhost:3000
│
├── backend/                     Express API
│   ├── src/
│   │   ├── index.ts             App entry point, route registration, news cron (every 4h)
│   │   ├── db.ts                 pg Pool singleton (max 10 conns)
│   │   ├── types.ts              DB row types (source of truth for backend)
│   │   ├── migrate.ts            Runs backend/db/*.sql in order, tracked in `_migrations`
│   │   ├── lib/
│   │   │   ├── asyncHandler.ts          Wraps async routes → passes errors to Express
│   │   │   ├── validate.ts              Zod request-body validation middleware
│   │   │   ├── r2.ts                    Cloudflare R2 upload/delete helpers
│   │   │   ├── downloadAndStoreCover.ts Download cover → R2; cover-retry (Google Books → OpenLibrary)
│   │   │   ├── extractSeries.ts         Parse series name/position from title/subtitle
│   │   │   ├── populateSeriesBooks.ts   Fetch sibling series books (Google Books + Claude gap-fill)
│   │   │   ├── generateSummary.ts       Claude book summary, cached in `books.ai_summary`
│   │   │   ├── fetchNewsFeeds.ts        RSS fetch (13 sources), 90-day retention
│   │   │   └── email.ts                 Resend: approval / welcome / password-reset emails
│   │   ├── middleware/
│   │   │   ├── auth.ts          verifyToken / signToken (JWT, sets req.userId)
│   │   │   └── errorHandler.ts  Global error handler (logs 5xx, returns JSON)
│   │   └── routes/
│   │       ├── auth.ts          register/login/approve/me/profile/password/reset
│   │       ├── books.ts         CRUD, import, export, shelf, tags, authors, featured, cover retry
│   │       ├── authors.ts       CRUD, follow/unfollow, restore
│   │       ├── series.ts        CRUD, populate, remove book from series
│   │       ├── uploads.ts       POST /api/uploads/cover → R2
│   │       ├── claude.ts        summary, next, similar-authors, series-detect
│   │       ├── search.ts        GET /api/search → Google Books / OpenLibrary (public)
│   │       ├── toppicks.ts      Curated/live top picks by genre (public)
│   │       ├── upcoming.ts      CRUD for upcoming releases
│   │       ├── news.ts          articles, sources, dismiss, refresh
│   │       └── logs.ts          POST /api/logs/errors (frontend error capture)
│   ├── db/                      Migrations 001–014 (see Database schema below)
│   ├── tsconfig.json            CommonJS output → dist/
│   └── Dockerfile               Build: npm install + tsc → Run: node dist/index.js
│
├── docs/                        This folder
├── .gitignore
├── package.json                 Root scripts (install:all, dev:frontend, dev:backend, build)
└── README.md
```

---

## Service communication

```
Browser
  │  HTTP (port 4200 dev / port 80 prod)
  ▼
nginx (frontend container)
  │  /api/* → proxy_pass $BACKEND_URL
  │  /* → serve Angular static files (SPA fallback)
  ▼
Express API (backend container, port 3000)
  │
  ├── pg Pool → PostgreSQL
  ├── Anthropic SDK → Claude API (external HTTPS)
  ├── Google Books / OpenLibrary APIs (external HTTPS)
  ├── Resend API → transactional email (external HTTPS)
  └── Cloudflare R2 (external HTTPS, cover uploads)
```

**Dev vs prod proxy:**
- Dev: Angular's `proxy.conf.json` handles `/api → localhost:3000` (no nginx)
- Prod: nginx injects `$BACKEND_URL` via `envsubst` at container startup

**Auth:** every route except `/api/auth/*`, `/api/search`, `/api/toppicks*`, and
`/api/logs/errors` requires a `Bearer` JWT — `verifyToken` middleware sets `req.userId`.

---

## Database schema

### Core tables
| Table | Purpose |
|---|---|
| `users` | Auth — `email`, `name`, `password_hash`, `status` (`active` \| `pending`) |
| `books` | ISBN, title, cover, description, page count, language, `ai_summary`, `google_books_id` |
| `authors` | Name, bio, website, image |
| `series` | Series name and description |
| `tags` | Genre/tag labels |

### Junction tables
| Table | Columns of note |
|---|---|
| `book_authors` | `(book_id, author_id, role)` — role: author/editor/illustrator/translator |
| `book_series` | `(book_id, series_id, position)` — position supports decimals (1.5 etc.) |
| `book_tags` | `(book_id, tag_id)` |

### User data
| Table | Columns of note |
|---|---|
| `user_books` | `(user_id, book_id)` UNIQUE — status, rating 1–5, review, notes, started/finished dates, `featured` |
| `author_follows` | `(user_id, author_id)` UNIQUE |
| `user_feed_sources` | Per-user enable/disable of a news source |
| `user_dismissed_articles` | Per-user article dismissals |
| `password_reset_tokens` | `(token, user_id, expires_at, used)` — 1-hour expiry |

### Content tables
| Table | Purpose |
|---|---|
| `news_sources` | RSS/site URLs for news fetching |
| `news_articles` | Fetched articles — `source_name`, `title`, `url` (unique), `description`, `image_url`, `published_at` |
| `upcoming_releases` | Per-user watchlist — `title`, `author_name`, `release_date`, `isbn`, `cover_url`, `description`, `notes`, optional FK to `books` |

### Migrations (`backend/db/`)
| File | Adds |
|---|---|
| `001_init.sql` | Stub `books` table (superseded) |
| `002_full_schema.sql` | Full schema: authors, series, tags, books, junctions, user_books, news_sources, upcoming_releases, author_follows |
| `003_add_users.sql` | `users` table + `user_id` on `user_books` / `author_follows` |
| `004_add_ai_summary.sql` | `books.ai_summary TEXT` |
| `005_upcoming_user_id.sql` | `user_id` FK on `upcoming_releases` |
| `006_upcoming_description.sql` | `upcoming_releases.description` |
| `007_google_books_id.sql` | `books.google_books_id` (unique, nullable) |
| `008_news_articles.sql` | `news_articles` table |
| `009_news_patch.sql` | Fixes `008` (missing `source_name`, broken index) |
| `010_news_columns.sql` | Idempotent fix: ensures `description`/`image_url`/`published_at` exist on `news_articles` |
| `011_featured_book.sql` | `user_books.featured` boolean |
| `012_news_dismissed.sql` | Global `news_articles.dismissed` (superseded by 013) |
| `013_user_feed_prefs.sql` | `user_feed_sources` + `user_dismissed_articles`; drops global `dismissed` |
| `014_user_status_reset.sql` | `users.status`; `password_reset_tokens` table |

Migrations run automatically on backend startup (`migrate.ts`) and are tracked in
`_migrations` so each runs exactly once. **Multi-statement migrations must be
idempotent** (`ADD COLUMN IF NOT EXISTS`) — see the 008/009/010 gotcha in CHANGELOG.

---

## API routes

All paths are under `/api`. 🔓 = no auth required. Everything else requires
`Authorization: Bearer <jwt>`.

### Auth (`/api/auth`)
| Method | Path | Purpose |
|---|---|---|
| 🔓 POST | `/register` | Register (requires `INVITE_CODE`); first user claims seed account and is active immediately, others are `pending` |
| 🔓 POST | `/login` | Email/password → 30-day JWT; 403 if `pending` |
| 🔓 GET | `/approve` | Admin approval link from email — activates a pending user |
| 🔓 POST | `/forgot-password` | Emails a 1-hour reset token |
| 🔓 POST | `/reset-password` | Consumes token, sets new password |
| GET | `/me` | Current user from token |
| PUT | `/profile` | Update name and/or email |
| POST | `/change-password` | Requires current password |

### Books (`/api/books`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | `{ books, total }` — filter by `status`/`search`, `limit`/`offset` |
| GET | `/export` | Download full library as JSON |
| POST | `/import` | Import from Google Books — creates authors/series, triggers background cover + AI summary + series population |
| GET | `/:id` | `BookWithDetails` |
| POST | `/` | Create manually (`author_ids`, `tag_ids`, series link) |
| PUT | `/:id` | Update metadata (title, ISBN, description, cover, year, pages, language) |
| DELETE | `/:id` | Delete book |
| PUT | `/:id/authors` | Replace all authors |
| PUT | `/:id/tags` | Replace all tags |
| PUT | `/:id/feature` | Toggle "now reading" featured book (unpins others for user) |
| POST | `/:id/retry-cover` | Re-fetch cover from Google Books / OpenLibrary |
| PUT | `/:id/shelf` | Upsert `user_books` — status, rating, review, notes, dates |
| DELETE | `/:id/shelf` | Remove from shelf |

### Authors (`/api/authors`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | `AuthorWithBooks[]` (user-owned books only) |
| GET | `/:id` | Single author + books |
| POST | `/` | Create |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |
| POST | `/restore` | Re-create a deleted author and re-link to specified books |
| POST/DELETE | `/:id/follow` | Follow / unfollow |

### Series (`/api/series`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | `SeriesWithBooks[]` where the user owns ≥1 book |
| GET | `/:id` | Single series + books (ordered by position) |
| POST | `/` | Create |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |
| POST | `/:id/populate` | 202 — background Google Books + Claude gap-fill of missing series books |
| DELETE | `/:id/books/:bookId` | Remove book from series |

### AI — Claude (`/api/claude`)
| Method | Path | Rate limit | Purpose |
|---|---|---|---|
| POST | `/summary` | 20/hr | 2–3 paragraph SFF-reader summary (cached in `books.ai_summary`) |
| POST | `/next` | 20/hr | 3 personalised "what to read next" recommendations |
| POST | `/similar-authors` | 20/hr | 3 authors with similar style/themes |
| POST | `/series-detect` | 100/hr | Detect series name + position from title/author (fires on every import) |

### Other
| Method | Path | Purpose |
|---|---|---|
| 🔓 GET | `/search?q=` | Google Books search (OpenLibrary fallback); includes series detection |
| 🔓 GET | `/toppicks?subjects=` | Curated/live top picks per genre (max 8) |
| 🔓 GET | `/toppicks/genres` | List of curatable genres |
| 🔓 POST | `/logs/errors` | Frontend error capture (also allowed pre-login) |
| POST | `/uploads/cover` | Multipart `cover` field (≤5MB) → R2 → `{ key, url }` |
| GET/POST/DELETE | `/upcoming` , `/upcoming/:id` | Watchlist CRUD; add triggers background cover upload |
| GET | `/news` | Paginated articles, respects per-user dismissals/source toggles |
| DELETE | `/news/:id` | Dismiss article for current user |
| GET | `/news/sources` | List sources + enabled state for user |
| PUT | `/news/sources/:name` | Toggle a source on/off for user |
| POST | `/news/refresh` | Trigger background RSS fetch; returns per-source results |
| 🔓 GET | `/health` | `{ status: "ok" }` |

---

## TypeScript types

Two mirrored type files — **always keep in sync** when changing the schema:

- `backend/src/types.ts` — includes `password_hash` on `User`
- `frontend/src/app/types/schema.types.ts` — `User` omits `password_hash` (never returned by API)

Key enriched types used in API responses:
- `BookWithDetails` — Book + authors[] + series[] + tags[] + user_book
- `AuthorWithBooks` — Author + books[] + followed bool
- `SeriesWithBooks` — Series + books[] ordered by position

---

## Claude AI integration

All Claude routes share the same pattern:
1. Fetch enriched data from Postgres
2. Build a prompt with the user's context
3. Call Claude with `messages.stream()` + `stream.finalMessage()` (avoids HTTP timeouts)
4. System prompts use `cache_control: { type: 'ephemeral' }` — cache hits at ~10% input token cost after the first call
5. JSON responses (`next`, `similar-authors`, `series-detect`) use a regex fallback (`extractJson`) in case Claude adds preamble text

See the [API routes](#ai--claude-apiclaude) table above for endpoints and rate limits.
All AI features degrade gracefully (no-op / skipped) if `ANTHROPIC_API_KEY` is unset.

---

## Email integration

`backend/src/lib/email.ts` sends transactional email via the Resend API:

| Email | Trigger | Recipient |
|---|---|---|
| Approval request | New non-seed user registers | `ADMIN_EMAIL`, link to `GET /api/auth/approve` |
| Welcome | Admin approves a pending user | The approved user |
| Password reset | `POST /api/auth/forgot-password` | The requesting user, 1-hour token link |

Links use `APP_URL` as the base. If `RESEND_API_KEY` is unset, sends are skipped
(logged, not fatal).

---

## Deployment topology (Railway + Cloudflare)

```
User
 │  HTTPS
 ▼
Cloudflare (DNS proxy, SSL, CDN cache for static assets)
 │
 ▼
Railway — Frontend service (nginx container)
 │  $BACKEND_URL (Railway internal or public URL)
 ▼
Railway — Backend service (Node container)
 │  DATABASE_URL (Railway Postgres plugin)
 ▼
Railway — PostgreSQL
```

**Environment variables summary:**

Backend service:
- `DATABASE_URL` — injected by Railway Postgres plugin (copy manually — see SETUP.md gotchas)
- `JWT_SECRET`, `INVITE_CODE` — required
- `ANTHROPIC_API_KEY` — enables AI features
- `GOOGLE_BOOKS_API_KEY` — book search / series population (OpenLibrary fallback if unset)
- `R2_*` vars — cover image storage (optional)
- `RESEND_API_KEY`, `ADMIN_EMAIL`, `FROM_EMAIL`, `APP_URL` — transactional email (optional)
- `NODE_ENV=production`

Frontend service:
- `BACKEND_URL` — e.g. `https://sf-fantasy-shelf-backend.up.railway.app`
