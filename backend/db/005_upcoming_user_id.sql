-- Add per-user ownership to upcoming_releases
ALTER TABLE upcoming_releases
  ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE upcoming_releases
  ALTER COLUMN user_id DROP DEFAULT;

CREATE INDEX upcoming_releases_user_idx ON upcoming_releases (user_id);
