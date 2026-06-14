# Zig's Codex — Roadmap

## Phase 0 — Foundation ✅ COMPLETE

### ✅ Infrastructure
- [x] Angular 17 frontend (standalone components, lazy routes, Angular Material)
- [x] Node/Express backend (TypeScript, compiled to dist/)
- [x] PostgreSQL schema (12 tables, migrations 001–004)
- [x] nginx with `$BACKEND_URL` envsubst (Railway-ready)
- [x] Dockerfiles for both services
- [x] Root monorepo scripts

### ✅ Database
- [x] Full schema: authors, books, series, tags, junctions, user_books, news_sources, news_articles, upcoming_releases, author_follows
- [x] Multi-user foundation: users table + user_id on user_books/author_follows
- [x] Status uses VARCHAR + CHECK constraint (not Postgres enum — safe for Railway rolling deploys)
- [x] `books.ai_summary TEXT` column (migration 004)

### ✅ Backend API
- [x] Books CRUD + enriched `BookWithDetails` (single aggregated SQL, no N+1)
- [x] Authors CRUD + follow/unfollow + `AuthorWithBooks`
- [x] Series CRUD + `SeriesWithBooks` (books ordered by position)
- [x] Shelf upsert (`PUT /api/books/:id/shelf`) — status, rating, notes
- [x] Cover image upload to Cloudflare R2
- [x] Claude AI: book summary (cached in DB), "what to read next", similar-author suggestions
- [x] Error handler, asyncHandler, prompt caching on Claude system prompts

### ✅ Deployment
- [x] Deployed to Railway (frontend + backend + Postgres)
- [x] Cloudflare R2 for cover image storage
- [x] GitHub Pages wiki (docs/index.html)

---

## Phase 1 — Auth ✅ COMPLETE

- [x] `POST /api/auth/register` — bcrypt (12 rounds), claims seed user on first registration
- [x] `POST /api/auth/login` — verify password, return 30-day JWT
- [x] `GET /api/auth/me` — current user from token
- [x] `PUT /api/auth/profile` — update name and/or email
- [x] `POST /api/auth/change-password` — requires current password verification
- [x] JWT middleware (`verifyToken`) on all protected routes
- [x] All routes use `req.userId` instead of hardcoded `1`
- [x] `AuthService` — login/register/logout/updateProfile/changePassword, 30-day JWT in localStorage
- [x] `authInterceptor` — attaches Bearer token + handles 401 auto-logout on expiry
- [x] `AuthGuard` on all app routes
- [x] Login page (`/login`) and Register page (`/register`)
- [x] Account settings page (`/account`) — edit profile + change password + sign out
- [x] Logout button + user name in sidebar footer
- [x] AUTH.md documentation

---

## Phase 2 — Book Management ✅ LARGELY COMPLETE

### ✅ Done
- [x] "Add Book" button in library header
- [x] Google Books search (with OpenLibrary fallback) — descriptions, covers, series detection
- [x] Book import: author lookup-or-create, duplicate ISBN guard, series find-or-create
- [x] Series auto-detection from subtitle + seriesInfo (ordinal words supported)
- [x] Series auto-population: on import, fetches all sibling books from Google Books and pre-links them to the series — they appear in Series Tracker as unowned
- [x] Cover download to Cloudflare R2 at import time (background job)
- [x] AI summary generated at import time and stored permanently in `books.ai_summary`
- [x] Book detail dialog — full metadata, inline status/rating editing, delete with confirm
- [x] Library search bar — debounced, searches title AND author name
- [x] Auto-populated series books hidden from My Library (only visible in Series Tracker)

### ✅ Done (continued)

- [x] Edit existing book metadata from detail dialog — pencil icon opens edit mode with fields: Title, Authors (comma-separated), Year, Pages, ISBN-13, Cover URL, Description
- [x] Manual book entry form — "Add manually" link in search step; same field set as above plus Series and Status
- [x] Edit authors saves via `PUT /api/books/:id/authors` — lookup-or-create per name, replaces junction rows

---

## Phase 2.5 — Series Tracker ✅ COMPLETE

The series tracker was a placeholder — now fully wired:

- [x] Series cards with progress bar, read count, per-book status badges
- [x] Book cover thumbnails per entry
- [x] Clickable books → opens detail dialog
- [x] Collapsible series — shows first book by default, expand for full list
- [x] Hover "Add to Library" button on unowned series books (one-click, want-to-read default)
- [x] Books not in library shown as greyed-out / non-clickable
- [x] "Populate series" button — `POST /api/series/:id/populate` triggers Google Books + Claude gap-fill for missing books (202 background job)
- [x] Remove book from series (`DELETE /api/series/:id/books/:bookId`)

---

## Phase 3 — Upcoming Releases ✅ COMPLETE

**Goal:** Track books you're waiting for before they release.

- [x] `GET /api/upcoming` — list releases ordered by `release_date`
- [x] `POST /api/upcoming` — add manually (title, author, date, ISBN, cover)
- [x] `DELETE /api/upcoming/:id` — remove
- [x] Frontend: timeline/list grouped by month
- [ ] "Link to book" — when the book releases and gets added to library, link the record (deferred)

---

## Phase 4 — News Feed ✅ COMPLETE

**Goal:** SFF news from RSS feeds directly in the app.

- [x] `GET /api/news` — paginated, newest first, respects per-user source toggles and dismissals
- [x] `POST /api/news/refresh` — manual refresh trigger, returns per-source results
- [x] Background RSS fetch job — `node-cron` inside backend, runs every 4 hours + on startup
- [x] Frontend: article cards with source badge, image, date, title, description snippet; source filter chips
- [x] 90-day rolling retention — articles older than 90 days pruned on each fetch run
- [x] 13 active sources across SF/Fantasy, Book News, and Bestsellers categories (Reactor, Locus, SFF World, The Wertzone, Fantasy Book Critic, Fantasy Faction, io9, Book Riot, Literary Hub, The Guardian Books, NPR Books, NYT Books, etc.)
- [x] Per-user source enable/disable (`user_feed_sources`) and per-user article dismiss (`user_dismissed_articles`, `GET/PUT /api/news/sources`, `DELETE /api/news/:id`)

---

## Phase 5 — Polish & Production ✅ LARGELY COMPLETE

**Goal:** App feels complete and is hardened for daily use.

### UX

- [x] Loading skeletons instead of spinners
- [x] Empty states with prompts (consistent CTA-first experience across library, series, upcoming, news, analytics)
- [x] Toast notifications — Snackbar wired for auth; extend to book add/delete actions
- [x] Search bar in My Library (title + author)
- [x] Dark/light mode toggle — `ThemeService` + CSS custom property system + Angular Material MDC overrides; gray light mode with full contrast across nav, dialogs, selects, badges
- [x] Library view modes — Grid, Shelf (medium tiles), List (rows), By Author (collapsible, series-position sort)
- [x] Cover images display at native proportions — no bands, no cropping across all pages

### Performance

- [x] Paginate `GET /api/books` — returns `{ books, total }` with `limit` / `offset`; library pagination controls shown when needed
- [ ] Angular `OnPush` change detection on book card

### Security & ops

- [x] Rate limiting on `/api/claude/*` routes — 20 req/hr for heavy endpoints, 100 req/hr for series-detect
- [x] Input validation with `zod` on all POST/PUT body parsing
- [x] Error monitoring — Railway log ingestion via `POST /api/logs/errors` + `GlobalErrorHandler` + auth interceptor capture (all errors visible in Railway dashboard under Service Logs)

### Phase 2 items (completed)

- [x] Manual book entry (no-search fallback)
- [x] Edit cover image URL from detail dialog
- [x] Edit authors (add/remove/swap) from detail dialog

### Outstanding tasks for next pass

- [ ] Add OnPush change detection to high-traffic book-card and list components to reduce unnecessary renders.
- [ ] Implement "link to book" for upcoming releases when a title later appears in the library.
- [ ] Review and tighten responsive behavior on mobile for add-book, detail dialogs, and analytics cards.

---

## Phase 6 — Dashboard, Analytics & Discovery ✅ COMPLETE

**Goal:** A home page that orients the user, plus richer discovery and reading insights.

### Dashboard (`/`)
- [x] Featured "now reading" book widget (`user_books.featured`, `PUT /api/books/:id/feature`)
- [x] Quick stats — total books, read/reading/want-to-read counts
- [x] Recommended series — series with in-progress reading
- [x] Upcoming releases preview (next 3)
- [x] Top picks carousel — 8 picks, filterable by genre (`GET /api/toppicks`, `/api/toppicks/genres`)

### Analytics (`/analytics`)
- [x] Stat cards — total books, pages read, authors, series
- [x] Charts — books by status, finished-by-year, publication-decade, top tags
- [x] Highlights — longest book read, featured book
- [x] JSON library export (`GET /api/books/export`, downloads `sf-fantasy-shelf-YYYY-MM-DD.json`)

### Discover (`/discover`)
- [x] "What to read next" — 3 AI recommendations, cached locally 24h
- [x] Similar authors — swipe-to-dismiss suggestion cards with Goodreads links
- [x] Restore deleted authors — re-link a previously removed author to chosen books (`POST /api/authors/restore`)

### Search & cover tooling
- [x] Public `GET /api/search` — Google Books with OpenLibrary fallback, used by add-book and add-upcoming flows
- [x] Cover retry — `POST /api/books/:id/retry-cover` re-fetches from Google Books / OpenLibrary

---

## Phase 7 — Multi-user Auth Hardening ✅ COMPLETE

**Goal:** Move from single-seed-user to a small invite-only multi-user app with admin oversight.

- [x] `INVITE_CODE` env var gates registration (`POST /api/auth/register`)
- [x] First registrant claims the seed user (id=1) and is `active` immediately
- [x] Subsequent registrants created with `status='pending'`; login returns 403 until approved
- [x] Admin approval via emailed link — `GET /api/auth/approve` (no admin UI; email-link only)
- [x] Welcome email sent on approval (Resend)
- [x] Forgot/reset password — `POST /api/auth/forgot-password` + `/reset-password`, 1-hour token in `password_reset_tokens`
- [x] Account page — theme/accent picker (10 background themes, 7 accent colors), persisted per user

---

## Deferred / Nice-to-have

- **Barcode scanner** — mobile camera → ISBN → auto-add
- **Goodreads CSV import** — import reading history
- **Author follow notifications** — email/push on new release
- **Book clubs** — shared shelves (requires multi-tenancy)
- **Mobile app** — Capacitor wrapper for iOS/Android
