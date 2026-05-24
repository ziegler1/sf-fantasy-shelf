ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;
