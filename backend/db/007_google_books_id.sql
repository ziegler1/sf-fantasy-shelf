ALTER TABLE books ADD COLUMN google_books_id TEXT;
CREATE UNIQUE INDEX books_google_books_id_idx ON books (google_books_id) WHERE google_books_id IS NOT NULL;
