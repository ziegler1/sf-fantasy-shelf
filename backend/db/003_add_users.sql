-- ============================================================
-- Migration 003: multi-user foundation
-- Adds a users table and wires user_id into user_books and
-- author_follows with DEFAULT 1 so all existing rows keep
-- belonging to the seed "local" user without any data change.
-- ============================================================

BEGIN;

-- ── 1. Users table ───────────────────────────────────────────

CREATE TABLE users (
  id            SERIAL      PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default single-user so existing data stays intact
INSERT INTO users (id, email, name, password_hash)
VALUES (1, 'local@localhost', 'Local User', '');
SELECT setval('users_id_seq', 1);

-- ── 2. user_books ─────────────────────────────────────────────

ALTER TABLE user_books
  ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1
    REFERENCES users (id) ON DELETE CASCADE;

-- Replace single-user UNIQUE (book_id) with multi-user version
ALTER TABLE user_books
  DROP CONSTRAINT user_books_book_id_key;

ALTER TABLE user_books
  ADD CONSTRAINT user_books_user_book_unique UNIQUE (user_id, book_id);

CREATE INDEX user_books_user_idx ON user_books (user_id);

-- ── 3. author_follows ─────────────────────────────────────────

ALTER TABLE author_follows
  ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1
    REFERENCES users (id) ON DELETE CASCADE;

-- Replace single-user UNIQUE (author_id) with multi-user version
ALTER TABLE author_follows
  DROP CONSTRAINT author_follows_author_id_key;

ALTER TABLE author_follows
  ADD CONSTRAINT author_follows_user_author_unique UNIQUE (user_id, author_id);

CREATE INDEX author_follows_user_idx ON author_follows (user_id);

COMMIT;
