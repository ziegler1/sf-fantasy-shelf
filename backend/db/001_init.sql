CREATE TABLE IF NOT EXISTS books (
  id         SERIAL PRIMARY KEY,
  title      TEXT        NOT NULL,
  author     TEXT        NOT NULL,
  genre      TEXT,
  status     TEXT        NOT NULL DEFAULT 'want-to-read'
               CHECK (status IN ('want-to-read', 'reading', 'read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS books_status_idx ON books (status);
