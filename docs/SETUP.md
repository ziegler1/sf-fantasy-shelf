# Zig's Codex — Setup Guide

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20+ | `node -v` |
| npm | 10+ | `npm -v` |
| Docker Desktop | any recent | `docker -v` |
| Git | any | `git -v` |

---

## Local development

### 1. Clone and install

```powershell
git clone https://github.com/<you>/sf-fantasy-shelf.git
cd sf-fantasy-shelf
npm run install:all
```

### 2. Start Postgres in Docker

```powershell
docker run -d `
  --name sf-fantasy-shelf-db `
  -e POSTGRES_USER=shelf `
  -e POSTGRES_PASSWORD=shelf `
  -e POSTGRES_DB=sf_fantasy_shelf `
  -p 5432:5432 `
  postgres:16-alpine
```

### 3. Configure backend environment

Copy the template and fill in your Anthropic key:

```powershell
Copy-Item backend/.env.example backend/.env
```

`backend/.env` should contain:
```
DATABASE_URL=postgresql://shelf:shelf@localhost:5432/sf_fantasy_shelf
PORT=3000
NODE_ENV=development
ANTHROPIC_API_KEY=sk-ant-...
```

R2 fields are optional — leave blank until you enable cover uploads:
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=sf-fantasy-shelf
R2_PUBLIC_URL=
```

### 4. Run database migrations

Run each migration in order, exactly once:

```powershell
# Migration 002 — full schema (replaces stub books table from 001)
Get-Content backend/db/002_full_schema.sql | docker exec -i sf-fantasy-shelf-db psql -U shelf -d sf_fantasy_shelf

# Migration 003 — users table + user_id columns
Get-Content backend/db/003_add_users.sql | docker exec -i sf-fantasy-shelf-db psql -U shelf -d sf_fantasy_shelf
```

> **Important:** Do NOT re-run migrations that have already been applied.
> `002` uses `BEGIN/COMMIT` and will `ROLLBACK` harmlessly if tables exist.
> `003` uses plain `ALTER TABLE` and will error on re-run.

### 5. Start the backend

```powershell
npm run dev:backend
```

Expected output: `Backend listening on port 3000`

### 6. Start the frontend

In a second terminal:

```powershell
npm run dev:frontend
```

The Angular dev server starts on `http://localhost:4200`.
It proxies `/api/*` to `localhost:3000` via `frontend/proxy.conf.json` — no nginx needed locally.

---

## Verify the stack is working

```powershell
# Health check
Invoke-RestMethod http://localhost:3000/health

# Add a test book
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/authors `
  -ContentType "application/json" `
  -Body '{"name":"Ursula K. Le Guin","bio":"American author of science fiction and fantasy."}'

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/books `
  -ContentType "application/json" `
  -Body '{"title":"The Left Hand of Darkness","author_ids":[{"author_id":1}]}'

# Put it on the shelf
Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/books/1/shelf `
  -ContentType "application/json" `
  -Body '{"status":"read","rating":5}'
```

Then open `http://localhost:4200` — the book should appear in My Library.

---

## Root npm scripts

| Script | What it does |
|---|---|
| `npm run install:all` | `npm install` in both `frontend/` and `backend/` |
| `npm run dev:backend` | `tsx watch src/index.ts` (hot-reload) |
| `npm run dev:frontend` | `ng serve` on port 4200 |
| `npm run build` | Compile backend TS + build Angular production bundle |
| `npm run build:backend` | `tsc` only |
| `npm run build:frontend` | `ng build` only |

---

## Railway deployment

### Prerequisites
- GitHub repo with this code pushed
- Railway account (railway.app)
- Railway CLI: `npm i -g @railway/cli`

### Steps

**1. Create Railway project**

New Project → choose your GitHub repo.

**2. Add Postgres**

In the Railway project: Add → Database → PostgreSQL.
**Important:** Railway does NOT auto-inject `DATABASE_URL` into services. You must copy it manually from the Postgres service → Variables tab and add it to the backend service Variables.

**3. Deploy the backend service**

Add → GitHub repo → set:
- Root directory: `backend`
- Railway detects the Dockerfile automatically

Set environment variables on the backend service:
| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | copy from Postgres service → Variables tab |

Generate a public domain on the backend service (Settings → Networking → Generate Domain).
Copy the URL — you'll need it for the frontend.

### 4. Migrations run automatically

Migrations are run automatically on every backend startup via `src/migrate.ts`. A `_migrations` table tracks which files have been applied — each migration runs exactly once. No manual steps needed.

**5. Deploy the frontend service**

Add → GitHub repo → same repo, different service:
- Root directory: `frontend`
- Railway detects the Dockerfile automatically

Set one environment variable:
| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://your-backend.up.railway.app` |

This is injected into nginx at container startup via `envsubst`, so nginx can proxy `/api/*` to the right place.

**6. (Optional) Add a custom domain**

Frontend service → Settings → Custom Domain → add e.g. `shelf.yourdomain.com`.

In Cloudflare DNS: CNAME `shelf` → `your-frontend.up.railway.app` (Proxied ✓).

---

## Cloudflare R2 (cover image uploads)

Only needed when you want to upload cover art. Already wired in the backend — just add credentials.

1. Cloudflare dashboard → R2 → Create bucket named `sf-fantasy-shelf`
2. R2 → Manage R2 API Tokens → Create token (Object Read & Write on your bucket)
3. Enable Public Access on the bucket (R2 → bucket → Settings → Public Access)
4. Add to backend Railway environment variables:

| Variable | Where |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare dashboard right sidebar |
| `R2_ACCESS_KEY_ID` | R2 API token page |
| `R2_SECRET_ACCESS_KEY` | R2 API token page |
| `R2_BUCKET_NAME` | `sf-fantasy-shelf` |
| `R2_PUBLIC_URL` | R2 bucket → Public URL (e.g. `https://pub-xxx.r2.dev`) |

---

## Key gotchas

**Migrations are one-way.** Run each numbered file exactly once.
`003_add_users.sql` uses `ALTER TABLE` — re-running it will error.

**The nginx proxy target is runtime-injected.** The `frontend/nginx/nginx.conf` file uses `${BACKEND_URL}` as a template variable. The Dockerfile runs `envsubst` at container startup to write the real value. If you see 502s from the frontend, check `BACKEND_URL` is set correctly.

**Relative API paths in the frontend.** All Angular services use `/api/...` — never `http://localhost:3000/api/...`. The proxy (dev) or nginx (prod) routes them. If you hardcode `localhost` in a service, it will break in production.

**Railway rolling deploys.** Railway keeps the old container alive while the new one starts. Migrations that take exclusive locks (like `ALTER TYPE ADD VALUE` for PostgreSQL enums) can deadlock. We avoid this by using `VARCHAR` for type-like columns, not native enums.

---

## Pre-deployment smoke tests

Before pushing to production, verify these core flows work end-to-end:

1. **Auth** — Register a new user with the invite code, login, update profile, change password. Verify JWT persists across tab refresh.
2. **Book import** — Search for a book (e.g. "The Martian"), import it, verify cover and AI summary generate in background.
3. **AI summary** — Check that a book imported has a summary on the detail card within 30 seconds. Verify it's cached (reload page = instant).
4. **News refresh** — Click "Refresh Feeds" on the news page. Verify at least one source returns articles and they appear in the grid.
5. **Upcoming add/delete** — Add an upcoming release, verify it appears in the timeline. Delete it, verify it's gone.
6. **Series auto-population** — Import a book that belongs to a series (e.g. "Dune"). Verify related books appear in Series Tracker within 1 minute.
7. **Dark/light mode** — Toggle theme and refresh the page. Verify it persists.

If any test fails, do not deploy — investigate and fix locally first.
