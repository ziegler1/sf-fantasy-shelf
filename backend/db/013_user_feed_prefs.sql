-- Per-user feed source preferences
CREATE TABLE IF NOT EXISTS user_feed_sources (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_name VARCHAR(200) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, source_name)
);

-- Per-user dismissed articles (replaces global dismissed flag)
CREATE TABLE IF NOT EXISTS user_dismissed_articles (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, article_id)
);

-- Drop the global dismissed column now that it's per-user
ALTER TABLE news_articles DROP COLUMN IF EXISTS dismissed;
