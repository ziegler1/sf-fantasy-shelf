# SF Fantasy Shelf — Roadmap

## Phase 0 — Foundation (COMPLETE)

Everything in this phase is built and committed. This is the baseline for all future work.

### ✅ Infrastructure
- [x] Angular 17 frontend (standalone components, lazy routes, Angular Material)
- [x] Node/Express backend (TypeScript, compiled to dist/)
- [x] PostgreSQL schema (12 tables, migrations 001–003)
- [x] nginx with `$BACKEND_URL` envsubst (Railway-ready)
- [x] Dockerfiles for both services
- [x] Root monorepo scripts

### ✅ Database
- [x] Full schema: authors, books, series, tags, junctions, user_books, news_sources, news_articles, upcoming_releases, author_follows
- [x] Multi-user foundation: users table + user_id on user_books/author_follows (DEFAULT 1, no auth yet)
- [x] Status uses VARCHAR + CHECK constraint (not Postgres enum — safe for Railway rolling deploys)

### ✅ Backend API
- [x] Books CRUD + enriched `BookWithDetails` (single aggregated SQL, no N+1)
- [x] Authors CRUD + follow/unfollow + `AuthorWithBooks`
- [x] Series CRUD + `SeriesWithBooks` (books ordered by position)
- [x] Shelf upsert (`PUT /api/books/:id/shelf`) — status, rating, notes
- [x] Cover image upload to Cloudflare R2 (wired, credentials optional)
- [x] Claude AI: book summary, "what to read next", similar-author suggestions
- [x] Error handler, asyncHandler, prompt caching on Claude system prompts

### ✅ Frontend
- [x] Sidebar layout (responsive, hamburger on mobile)
- [x] My Library — book grid, status filters, cover/placeholder, stars, tags, AI summary toggle
- [x] Series Tracker — progress bars, book list with position
- [x] Discover — Claude recommendations + similar-author lookup
- [x] Upcoming Releases — placeholder page
- [x] News Feed — placeholder page
- [x] All Angular services typed against schema.types.ts

### ✅ Deployment
- [x] Railway deployment plan documented (SETUP.md)
- [x] Cloudflare R2 integration documented
- [x] Cloudflare DNS/proxy instructions documented

---

## Phase 1 — Auth

**Goal:** Multiple users can sign up and log in. Each user has their own shelf. The seed user (id=1) is retired.

The database schema is already multi-user. This phase wires the backend routes and frontend auth flow.

### Backend
- [ ] `POST /api/auth/register` — hash password with `bcrypt`, insert into `users`
- [ ] `POST /api/auth/login` — verify password, return JWT (`jsonwebtoken`)
- [ ] `GET /api/auth/me` — return current user from token
- [ ] JWT middleware — `verifyToken` middleware that extracts `user_id` from the Bearer token and attaches it to `req`
- [ ] All protected routes pass `req.user_id` to SQL queries instead of hardcoded `1`
- [ ] Add `JWT_SECRET` to `.env.example` and Railway backend vars

### Frontend
- [ ] `AuthService` — `login()`, `register()`, `logout()`, `currentUser$` signal
- [ ] Login page (`/login`) and Register page (`/register`)
- [ ] Auth guard on all protected routes
- [ ] JWT stored in `localStorage`; Angular `HttpInterceptor` attaches `Authorization: Bearer <token>` header to all `/api/*` requests
- [ ] Logout button in sidebar footer

### Notes
- `bcrypt` rounds = 12 (safe default, ~300ms per hash)
- JWT expiry = 7 days; no refresh token for now (personal app)
- Keep single-user fallback: if `MULTI_USER=false` env var is set, skip auth (useful during dev)
- Password reset deferred — add to deferred list; worth building if family members use the app

---

## Phase 2 — Book Management

**Goal:** Users can add, edit, and remove books from their library via the UI. Cover uploads work.

### Deploy to production (do this first)

- [ ] Push to GitHub, create Railway project, deploy both services
- [ ] Run migrations 002 + 003 on Railway Postgres
- [ ] Set all env vars (ANTHROPIC_API_KEY, BACKEND_URL, DATABASE_URL)
- [ ] Configure Cloudflare DNS CNAME → Railway frontend domain
- [ ] Verify the app is live and reachable before wiring auth

### Add books
- [ ] "Add Book" button / FAB on My Library page
- [ ] Add book dialog/page — manual entry form (title, authors, ISBN, series, tags, cover URL)
- [ ] Cover image upload — drag-and-drop to R2, updates `books.cover_url`
- [ ] Book search API — try both and use whichever fills fields better:
  - Google Books API (`https://www.googleapis.com/books/v1/volumes?q=`) — tends to have richer SFF metadata and series info
  - OpenLibrary API (`https://openlibrary.org/api/books`) — open, no key needed, good ISBN coverage
- [ ] Series auto-detection — Google Books and OpenLibrary both include series info in many entries; parse and pre-fill the series selector
- [ ] Cache Claude summaries in `books.description` or a new `books.ai_summary` column — prevents regenerating on every card open once real books are in the library

### Edit / delete books
- [ ] Book detail page (`/library/:id`) — full view, edit form, delete
- [ ] Edit reading status directly from book card (click status badge → dropdown)
- [ ] Star rating picker on book card

### Author and series management
- [ ] Add/edit authors from book entry form
- [ ] Series selector with "create new" option

---

## Phase 3 — Upcoming Releases

**Goal:** The Upcoming Releases page is functional — users can track books they're waiting for.

- [ ] `GET /api/upcoming` — list upcoming releases (ordered by `release_date`)
- [ ] `POST /api/upcoming` — add a release manually (title, author_name, date, ISBN, cover)
- [ ] `DELETE /api/upcoming/:id` — remove
- [ ] Frontend: Upcoming page shows a timeline/list grouped by month
- [ ] "Link to book" — if the book releases and gets added to the library, link the record
- [ ] Optional: auto-fetch from StoryGraph or OpenLibrary watchlists

---

## Phase 4 — News Feed

**Goal:** The News Feed page shows real SFF news from RSS feeds.

- [ ] `POST /api/news/sources` — add an RSS/Atom source URL
- [ ] `GET /api/news/articles` — list articles (paginated, newest first, optional source filter)
- [ ] Background RSS fetch job — runs every 6 hours, stores articles in `news_articles`
  - Use `node-cron` inside the existing backend service — simplest path on Railway hobby plan. A separate Railway worker service counts as an additional service and costs extra. The backend is always running anyway.
- [ ] Frontend: News page — article cards with title, source, summary, published date, link out
- [ ] Seed with 3-4 default SFF news sources (e.g. The Verge SFF, Tor.com RSS, Fantasy Book Review)

---

## Phase 5 — Polish & Production

**Goal:** App is stable, fast, and feels complete.

### UX
- [ ] Dark/light mode toggle (Angular Material theming)
- [ ] Loading skeletons instead of spinners
- [ ] Toast notifications for save/delete actions (Angular Material Snackbar)
- [ ] Empty states with prompts to add content (not just "No books yet")
- [ ] Search bar in My Library with debounced input

### Performance
- [ ] Paginate `/api/books` list (currently returns all)
- [ ] Angular `OnPush` change detection on book card component
- [ ] HTTP caching headers on static assets (already in nginx)

### Claude improvements
- [ ] Stream Claude responses to the frontend via SSE (eliminate the wait for full response)
- [ ] "Rate this recommendation" feedback to improve future suggestions
- ~~Cache Claude summaries in the `books` table~~ — moved to Phase 2; you'll burn API credits fast once real books are being added

### Security & ops
- [ ] Rate limiting on `/api/claude/*` routes (per user, e.g. 20 req/hour)
- [ ] Input validation with `zod` on all `POST`/`PUT` body parsing
- [ ] Error monitoring (Sentry or Railway's built-in logs)
- [ ] Automated migration runner on backend startup (with a `migrations` tracking table)

---

## Deferred / Nice-to-have

These are ideas that didn't make the cut for the main phases but are worth keeping:

- **Password reset** — email-based reset flow; worth adding if family members use the app
- **Barcode scanner** — mobile camera → ISBN → auto-add book
- **Goodreads CSV import** — import existing reading history
- **Author follow notifications** — email/push when a followed author has a new release
- **Reading statistics** — books per year, pages per month, genre breakdown
- **Book clubs** — shared shelves for groups (requires multi-tenancy)
- **Mobile app** — Capacitor wrapper around the Angular app for iOS/Android
