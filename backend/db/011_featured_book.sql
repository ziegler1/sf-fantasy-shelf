ALTER TABLE user_books ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
