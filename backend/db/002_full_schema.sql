-- ============================================================
-- Migration 002: full schema
-- Replaces the stub books table with the complete schema.
-- Safe to run on an existing DB — migrates any data first.
-- ============================================================

BEGIN;

-- ── 1. Preserve any existing book data ───────────────────────
CREATE TABLE IF NOT EXISTS _books_migration_backup AS
  SELECT * FROM books;

-- ── 2. Drop stub table ───────────────────────────────────────
DROP TABLE IF EXISTS books CASCADE;

-- ── 3. Core lookup tables ────────────────────────────────────

CREATE TABLE authors (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  bio        TEXT,
  website    TEXT,
  image_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX authors_name_idx ON authors (name);

CREATE TABLE series (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX series_name_idx ON series (name);

CREATE TABLE tags (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE news_sources (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  feed_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Books ─────────────────────────────────────────────────

CREATE TABLE books (
  id           SERIAL PRIMARY KEY,
  title        TEXT        NOT NULL,
  isbn         TEXT        UNIQUE,
  isbn13       TEXT        UNIQUE,
  description  TEXT,
  cover_url    TEXT,
  published_at DATE,
  page_count   INTEGER     CHECK (page_count > 0),
  language     TEXT        NOT NULL DEFAULT 'en',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX books_title_idx      ON books (title);
CREATE INDEX books_published_idx  ON books (published_at);

-- ── 5. Junction tables ───────────────────────────────────────

CREATE TABLE book_authors (
  book_id   INTEGER NOT NULL REFERENCES books   (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  role      TEXT    NOT NULL DEFAULT 'author',   -- author | editor | illustrator | translator
  PRIMARY KEY (book_id, author_id)
);

CREATE INDEX book_authors_author_idx ON book_authors (author_id);

CREATE TABLE book_series (
  book_id   INTEGER NOT NULL REFERENCES books  (id) ON DELETE CASCADE,
  series_id INTEGER NOT NULL REFERENCES series (id) ON DELETE CASCADE,
  position  NUMERIC,                             -- 1, 1.5, 2 … null = standalone
  PRIMARY KEY (book_id, series_id)
);

CREATE INDEX book_series_series_idx ON book_series (series_id);

CREATE TABLE book_tags (
  book_id INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags  (id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE INDEX book_tags_tag_idx ON book_tags (tag_id);

-- ── 6. User reading shelf ────────────────────────────────────

CREATE TABLE user_books (
  id          SERIAL PRIMARY KEY,
  book_id     INTEGER     NOT NULL UNIQUE REFERENCES books (id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'want-to-read'
                CHECK (status IN ('want-to-read', 'reading', 'read', 'dnf')),
  rating      SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  review      TEXT,
  notes       TEXT,
  started_at  DATE,
  finished_at DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_books_status_idx ON user_books (status);
CREATE INDEX user_books_rating_idx ON user_books (rating);

-- ── 7. News ──────────────────────────────────────────────────

CREATE TABLE news_articles (
  id           SERIAL PRIMARY KEY,
  source_id    INTEGER     REFERENCES news_sources (id) ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  url          TEXT        NOT NULL UNIQUE,
  summary      TEXT,
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX news_articles_source_idx     ON news_articles (source_id);
CREATE INDEX news_articles_published_idx  ON news_articles (published_at DESC);

-- ── 8. Upcoming releases ─────────────────────────────────────

CREATE TABLE upcoming_releases (
  id           SERIAL PRIMARY KEY,
  book_id      INTEGER     REFERENCES books (id) ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  author_name  TEXT,                             -- denormalized convenience field
  release_date DATE,
  isbn         TEXT,
  cover_url    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX upcoming_releases_date_idx ON upcoming_releases (release_date);

-- ── 9. Author follows ────────────────────────────────────────

CREATE TABLE author_follows (
  id         SERIAL PRIMARY KEY,
  author_id  INTEGER     NOT NULL UNIQUE REFERENCES authors (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. Migrate backed-up data into new schema ───────────────
-- Each old row becomes: a book + an author + a user_book entry.

INSERT INTO books (id, title, created_at, updated_at)
  SELECT id, title, created_at, updated_at
  FROM _books_migration_backup;

-- Re-sync the sequence so future inserts don't collide
SELECT setval('books_id_seq', COALESCE((SELECT MAX(id) FROM books), 1));

INSERT INTO authors (name)
  SELECT DISTINCT author FROM _books_migration_backup
  WHERE author IS NOT NULL;

INSERT INTO book_authors (book_id, author_id)
  SELECT b.id, a.id
  FROM _books_migration_backup b
  JOIN authors a ON a.name = b.author
  WHERE b.author IS NOT NULL;

-- genre becomes a tag
INSERT INTO tags (name)
  SELECT DISTINCT genre FROM _books_migration_backup
  WHERE genre IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

INSERT INTO book_tags (book_id, tag_id)
  SELECT b.id, t.id
  FROM _books_migration_backup b
  JOIN tags t ON t.name = b.genre
  WHERE b.genre IS NOT NULL;

INSERT INTO user_books (book_id, status, created_at, updated_at)
  SELECT id, status, created_at, updated_at
  FROM _books_migration_backup
  WHERE status IS NOT NULL;

DROP TABLE _books_migration_backup;

COMMIT;
