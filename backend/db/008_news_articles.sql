CREATE TABLE IF NOT EXISTS news_articles (
  id           SERIAL PRIMARY KEY,
  source_name  TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  description  TEXT,
  image_url    TEXT,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS news_articles_url_idx
  ON news_articles (url);

CREATE INDEX IF NOT EXISTS news_articles_published_at_idx
  ON news_articles (COALESCE(published_at, created_at) DESC);
