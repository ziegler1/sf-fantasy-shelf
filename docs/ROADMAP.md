# SF Fantasy Shelf — Roadmap

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

### ❌ Still To Do
- [ ] Edit existing book metadata (title, authors, cover, description) from detail dialog
- [ ] Manual book entry form (no-search fallback for books not on Google Books)

---

## Phase 2.5 — Series Tracker ✅ COMPLETE

The series tracker was a placeholder — now fully wired:

- [x] Series cards with progress bar, read count, per-book status badges
- [x] Book cover thumbnails per entry
- [x] Clickable books → opens detail dialog
- [x] Collapsible series — shows first book by default, expand for full list
- [x] Hover "Add to Library" button on unowned series books (one-click, want-to-read default)
- [x] Books not in library shown as greyed-out / non-clickable

---

## Phase 3 — Upcoming Releases

**Goal:** Track books you're waiting for before they release.

- [ ] `GET /api/upcoming` — list releases ordered by `release_date`
- [ ] `POST /api/upcoming` — add manually (title, author, date, ISBN, cover)
- [ ] `DELETE /api/upcoming/:id` — remove
- [ ] Frontend: timeline/list grouped by month
- [ ] "Link to book" — when the book releases and gets added to library, link the record

---

## Phase 4 — News Feed

**Goal:** SFF news from RSS feeds directly in the app.

- [ ] `POST /api/news/sources` — add an RSS/Atom source URL
- [ ] `GET /api/news/articles` — paginated, newest first, optional source filter
- [ ] Background RSS fetch job — `node-cron` inside backend, runs every 6 hours
- [ ] Frontend: article cards with title, source, summary, published date, link out
- [ ] Seed with 3–4 default SFF sources (Tor.com, The Verge SFF, Fantasy Book Review)

---

## Phase 5 — Polish & Production

**Goal:** App feels complete and is hardened for daily use.

### UX
- [ ] Loading skeletons instead of spinners
- [ ] Empty states with prompts (e.g. "Add a book to get started")
- [x] Toast notifications — Snackbar wired for auth; extend to book add/delete actions
- [x] Search bar in My Library (title + author)
- [ ] Dark/light mode toggle

### Performance
- [ ] Paginate `GET /api/books` (currently returns all — fine for small libraries)
- [ ] Angular `OnPush` change detection on book card

### Security & ops
- [ ] Rate limiting on `/api/claude/*` routes (per user, e.g. 20 req/hour)
- [ ] Input validation with `zod` on all POST/PUT body parsing
- [ ] Error monitoring (Sentry or Railway logs)

### Remaining Phase 2 items
- [ ] Edit existing book metadata from detail dialog
- [ ] Manual book entry (no-search fallback)

---

## Deferred / Nice-to-have

- **Password reset via email** — requires email provider (SendGrid/Resend)
- **Barcode scanner** — mobile camera → ISBN → auto-add
- **Goodreads CSV import** — import reading history
- **Author follow notifications** — email/push on new release
- **Reading statistics** — books per year, pages per month, genre breakdown
- **Book clubs** — shared shelves (requires multi-tenancy)
- **Mobile app** — Capacitor wrapper for iOS/Android
