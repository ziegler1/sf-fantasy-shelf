-- Ensure all news_articles columns exist regardless of which migration 008 run succeeded.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS image_url    TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
