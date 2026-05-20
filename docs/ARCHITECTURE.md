# SF Fantasy Shelf — Architecture

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Angular 17 (standalone components) | Lazy-loaded routes, Angular Material M3 |
| Backend | Node.js 20 / Express 4 (TypeScript) | Compiled to `dist/`, runs in Docker |
| Database | PostgreSQL 16 | Runs in Docker locally, Railway plugin in prod |
| Serving | nginx 1.25 | Serves built Angular assets, proxies `/api/*` to backend |
| AI | Anthropic Claude (`claude-sonnet-4-5`) | via `@anthropic-ai/sdk`, streamed + system-prompt cached |
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
│   │   │   └── services/       BookService, AuthorService, SeriesService, ClaudeService
│   │   ├── features/
│   │   │   ├── library/        My Library page (book grid, AI summary)
│   │   │   ├── series-tracker/ Series progress page
│   │   │   ├── discover/       AI recommendations + similar authors
│   │   │   ├── upcoming/       Placeholder
│   │   │   └── news/           Placeholder
│   │   └── types/
│   │       └── schema.types.ts Shared DB types (mirrors backend/src/types.ts)
│   ├── nginx/nginx.conf        Uses $BACKEND_URL envsubst variable
│   ├── Dockerfile              Build: node:20 → Serve: nginx:1.25
│   └── proxy.conf.json         Dev proxy: /api → localhost:3000
│
├── backend/                    Express API
│   ├── src/
│   │   ├── index.ts            App entry point, route registration
│   │   ├── db.ts               pg Pool singleton (max 10 conns)
│   │   ├── types.ts            DB row types (source of truth for backend)
│   │   ├── lib/
│   │   │   ├── asyncHandler.ts Wraps async routes → passes errors to Express
│   │   │   └── r2.ts           Cloudflare R2 upload/delete helpers
│   │   ├── middleware/
│   │   │   └── errorHandler.ts Global error handler (logs 5xx, returns JSON)
│   │   └── routes/
│   │       ├── books.ts        CRUD + /shelf upsert
│   │       ├── authors.ts      CRUD + follow/unfollow
│   │       ├── series.ts       CRUD
│   │       ├── uploads.ts      POST /api/uploads/cover → R2
│   │       └── claude.ts       /summary, /next, /similar-authors
│   ├── db/
│   │   ├── 001_init.sql        Stub books table (superseded)
│   │   ├── 002_full_schema.sql Full schema + data migration from 001
│   │   └── 003_add_users.sql   users table + user_id on user_books/author_follows
│   ├── tsconfig.json           CommonJS output → dist/
│   └── Dockerfile              Build: npm ci + tsc → Run: node dist/index.js
│
├── docs/                       This folder
├── .gitignore
├── package.json                Root scripts (install:all, dev:frontend, dev:backend, build)
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
  └── Anthropic SDK → Claude API (external HTTPS)
       └── Cloudflare R2 (external HTTPS, only for cover uploads)
```

**Dev vs prod proxy:**
- Dev: Angular's `proxy.conf.json` handles `/api → localhost:3000` (no nginx)
- Prod: nginx injects `$BACKEND_URL` via `envsubst` at container startup

---

## Database schema

### Core tables
| Table | Purpose |
|---|---|
| `users` | Auth foundation (password_hash, email) — single seed user id=1 for now |
| `books` | ISBN, title, cover, description, page count, language |
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
| `user_books` | `(user_id, book_id)` UNIQUE — status, rating 1–5, review, notes, dates |
| `author_follows` | `(user_id, author_id)` UNIQUE |

### Content tables (wired, not yet populated)
| Table | Purpose |
|---|---|
| `news_sources` | RSS/site URLs for news fetching |
| `news_articles` | Fetched articles, unique by URL |
| `upcoming_releases` | Watchlist with optional FK to books |

---

## API routes

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/books?status=&search=` | `BookWithDetails[]` (enriched JSON agg) |
| `GET/POST/PUT/DELETE` | `/api/books/:id` | Book CRUD |
| `PUT/DELETE` | `/api/books/:id/shelf` | Upsert / remove user_book |
| `GET` | `/api/authors` | `AuthorWithBooks[]` |
| `GET/POST/PUT/DELETE` | `/api/authors/:id` | Author CRUD |
| `POST/DELETE` | `/api/authors/:id/follow` | Follow toggle |
| `GET` | `/api/series` | `SeriesWithBooks[]` (ordered by position) |
| `GET/POST/PUT/DELETE` | `/api/series/:id` | Series CRUD |
| `POST` | `/api/uploads/cover` | Multipart `cover` field → R2 → `{ key, url }` |
| `POST` | `/api/claude/summary` | `{ summary, book_id }` |
| `POST` | `/api/claude/next` | `{ recommendations[] }` |
| `POST` | `/api/claude/similar-authors` | `{ suggestions[] }` |
| `GET` | `/health` | `{ status: "ok" }` |

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

All three routes share the same pattern:
1. Fetch enriched data from Postgres
2. Build a prompt with the user's context
3. Call Claude with `messages.stream()` + `stream.finalMessage()` (avoids HTTP timeouts)
4. System prompts use `cache_control: { type: 'ephemeral' }` — cache hits at ~10% input token cost after the first call

| Endpoint | Input | Claude task |
|---|---|---|
| `/api/claude/summary` | book_id | 2-3 paragraph SFF-reader summary |
| `/api/claude/next` | user_id | 3 personalised "what to read next" recommendations |
| `/api/claude/similar-authors` | author_id, user_id | 3 authors with similar style/themes |

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
- `DATABASE_URL` — injected by Railway Postgres plugin
- `ANTHROPIC_API_KEY`
- `NODE_ENV=production`
- `R2_*` vars (when R2 cover uploads are enabled)

Frontend service:
- `BACKEND_URL` — e.g. `https://sf-fantasy-shelf-backend.up.railway.app`
