// Mirror of frontend/src/app/types/schema.types.ts
// Keep both files in sync when changing the schema.

export type ReadingStatus = 'want-to-read' | 'reading' | 'read' | 'dnf';
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

export interface Book {
  id: number;
  title: string;
  isbn: string | null;
  isbn13: string | null;
  description: string | null;
  cover_url: string | null;
  published_at: string | null;
  page_count: number | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface UserBook {
  id: number;
  book_id: number;
  status: ReadingStatus;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  review: string | null;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

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
