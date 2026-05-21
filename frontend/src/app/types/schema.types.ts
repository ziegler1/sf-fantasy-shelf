// Keep in sync with backend/src/types.ts and the db migrations.

export type ReadingStatus = 'want-to-read' | 'reading' | 'read' | 'dnf';

// password_hash intentionally omitted — never returned by the API
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}
export type AuthorRole = 'author' | 'editor' | 'illustrator' | 'translator';

export interface Author {
  id: number;
  name: string;
  bio: string | null;
  website: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Series {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface NewsSource {
  id: number;
  name: string;
  url: string;
  feed_url: string | null;
  created_at: string;
}

export interface Book {
  id: number;
  title: string;
  isbn: string | null;
  isbn13: string | null;
  description: string | null;
  cover_url: string | null;
  published_at: string | null;  // ISO date string
  page_count: number | null;
  language: string;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookAuthor {
  book_id: number;
  author_id: number;
  role: AuthorRole;
}

export interface BookSeries {
  book_id: number;
  series_id: number;
  position: number | null;
}

export interface BookTag {
  book_id: number;
  tag_id: number;
}

export interface UserBook {
  id: number;
  user_id: number;
  book_id: number;
  status: ReadingStatus;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  review: string | null;
  notes: string | null;
  started_at: string | null;   // ISO date string
  finished_at: string | null;  // ISO date string
  created_at: string;
  updated_at: string;
}

export interface NewsArticle {
  id: number;
  source_id: number | null;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  created_at: string;
}

export interface UpcomingRelease {
  id: number;
  book_id: number | null;
  title: string;
  author_name: string | null;
  release_date: string | null;  // ISO date string
  isbn: string | null;
  cover_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorFollow {
  id: number;
  user_id: number;
  author_id: number;
  created_at: string;
}

// ── Enriched view types (joins) ─────────────────────────────

export interface BookWithDetails extends Book {
  authors: (Author & { role: AuthorRole })[];
  series: (Series & { position: number | null })[];
  tags: Tag[];
  user_book: UserBook | null;
}

export interface AuthorWithBooks extends Author {
  books: Book[];
  followed: boolean;
}

export interface SeriesWithBooks extends Series {
  books: (Book & { position: number | null })[];
}
