# SF Fantasy Shelf

A web app for tracking your sci-fi and fantasy book collection.

## Stack

| Layer    | Technology          |
|----------|---------------------|
| Frontend | Angular 17+         |
| Backend  | Node.js / Express   |
| Database | PostgreSQL          |
| Serving  | nginx (frontend)    |
| Deploy   | Railway             |

## Monorepo Structure

```
sf-fantasy-shelf/
├── frontend/          # Angular app (served via nginx)
│   ├── src/
│   ├── nginx/
│   └── Dockerfile
├── backend/           # Express API
│   ├── src/
│   └── Dockerfile
└── package.json       # Root scripts
```

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- PostgreSQL 15+

### Install

```bash
npm run install:all
```

### Run locally

```bash
# Backend (port 3000)
npm run dev:backend

# Frontend (port 4200, in another terminal)
npm run dev:frontend
```

### Environment Variables

Copy `.env.example` to `.env` in `backend/` and fill in values:

```
DATABASE_URL=postgresql://user:password@localhost:5432/sf_fantasy_shelf
PORT=3000
```

## Deploy (Railway)

Each service (`frontend`, `backend`) is deployed as a separate Railway service
pointing to its own `Dockerfile`. Set the `DATABASE_URL` environment variable
on the backend service using Railway's Postgres plugin.

## Scripts (root)

| Script              | Description                    |
|---------------------|--------------------------------|
| `npm run dev:frontend` | Start Angular dev server    |
| `npm run dev:backend`  | Start Express with nodemon  |
| `npm run build`        | Build both services         |
| `npm run install:all`  | Install all dependencies    |
