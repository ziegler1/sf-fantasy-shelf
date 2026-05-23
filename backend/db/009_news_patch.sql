-- Adds source_name if the column was missing due to a failed index creation in 008.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'Unknown';

-- Replace the broken functional index with a plain two-column index.
DROP INDEX IF EXISTS news_articles_published_at_idx;
CREATE INDEX IF NOT EXISTS news_articles_published_at_idx
  ON news_articles (published_at DESC NULLS LAST, created_at DESC);
