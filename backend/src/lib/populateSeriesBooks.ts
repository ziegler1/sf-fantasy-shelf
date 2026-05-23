import pool from '../db';
import { extractSeries, isSameSeries } from './extractSeries';

function toDate(s: string | undefined | null): string | null {
  if (!s) return null;
  return /^\d{4}$/.test(s.trim()) ? `${s.trim()}-01-01` : s;
}

export async function populateSeriesBooks(
  seriesId: number,
  seriesName: string,
  googleBooksId: string | null,
): Promise<void> {
  const apiKey = process.env['GOOGLE_BOOKS_API_KEY'];
  if (!apiKey) return;

  // Strategy 1: associated endpoint — given the imported book's volume ID,
  // Google returns all volumes in the same series. Most reliable approach.
  let items: GBVolume[] = [];
  if (googleBooksId) {
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(googleBooksId)}/associated?maxResults=40&key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as { items?: GBVolume[] };
      items = data.items ?? [];
    }
  }

  // Strategy 2: text search fallback — search by series name across two pages.
  // Less reliable (seriesInfo is sparsely populated) but covers cases where the
  // imported book had no Google Books ID (e.g. manual entry).
  if (!items.length) {
    const q = encodeURIComponent(`"${seriesName}"`);
    const base = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=40&orderBy=relevance&key=${apiKey}`;

    const fetchPage = async (startIndex: number): Promise<{ items?: GBVolume[] }> => {
      const res = await fetch(`${base}&startIndex=${startIndex}`);
      if (!res.ok) return {};
      return res.json() as Promise<{ items?: GBVolume[] }>;
    };

    const [data1, data2] = await Promise.all([fetchPage(0), fetchPage(40)]);
    items = [...(data1.items ?? []), ...(data2.items ?? [])];
  }

  const fromAssociated = !!googleBooksId && items.length > 0;

  for (const item of items) {
    const v = item.volumeInfo;
    const { name: detectedSeries, position } = extractSeries(
      v.title ?? '', v.subtitle, item.seriesInfo,
    );

    // For associated results we trust Google's grouping — only require a position.
    // For text-search fallback, require either a name match or an API order number.
    if (fromAssociated) {
      if (!position) continue;
    } else {
      const nameMatch = detectedSeries && isSameSeries(detectedSeries, seriesName);
      const apiOrderNumber = item.seriesInfo?.bookSeries?.[0]?.orderNumber;
      if (!nameMatch && !apiOrderNumber) continue;
      if (!position) continue;
    }

    // Skip if we already have a book at this position — prevents duplicate
    // editions (hardcover, paperback, ebook) from creating multiple DB records.
    const posCheck = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM book_series WHERE series_id = $1 AND position = $2)',
      [seriesId, position],
    );
    if (posCheck.rows[0].exists) continue;

    const isbns = v.industryIdentifiers ?? [];
    const isbn13 = isbns.find(i => i.type === 'ISBN_13')?.identifier ?? null;
    const isbn10  = isbns.find(i => i.type === 'ISBN_10')?.identifier  ?? null;

    // Look for an existing book by ISBN first
    let bookId: number | null = null;
    if (isbn13 || isbn10) {
      const found = await pool.query<{ id: number }>(
        `SELECT id FROM books WHERE (isbn13 = $1 AND isbn13 IS NOT NULL)
                                 OR (isbn  = $2 AND isbn  IS NOT NULL) LIMIT 1`,
        [isbn13, isbn10],
      );
      if (found.rows.length) bookId = found.rows[0].id;
    }

    // If not found, insert a new book record
    if (!bookId) {
      const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
      const cover_url = rawCover ? rawCover.replace('http://', 'https://') : null;
      try {
        const { rows } = await pool.query<{ id: number }>(
          `INSERT INTO books (title, isbn, isbn13, description, cover_url, published_at, page_count, language, google_books_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            v.title ?? 'Unknown Title',
            isbn10, isbn13,
            v.description ?? null,
            cover_url,
            toDate(v.publishedDate),
            v.pageCount ?? null,
            v.language ?? 'en',
            item.id ?? null,
          ],
        );
        bookId = rows[0]?.id ?? null;
      } catch {
        if (isbn13) {
          const r = await pool.query<{ id: number }>('SELECT id FROM books WHERE isbn13=$1', [isbn13]);
          bookId = r.rows[0]?.id ?? null;
        } else if (isbn10) {
          const r = await pool.query<{ id: number }>('SELECT id FROM books WHERE isbn=$1', [isbn10]);
          bookId = r.rows[0]?.id ?? null;
        }
      }
    }

    if (!bookId) continue;

    // Link authors
    for (const authorName of v.authors ?? []) {
      const trimmed = authorName.trim();
      if (!trimmed) continue;
      let authorId: number;
      const found = await pool.query<{ id: number }>(
        'SELECT id FROM authors WHERE LOWER(name) = LOWER($1) LIMIT 1', [trimmed],
      );
      if (found.rows.length) {
        authorId = found.rows[0].id;
      } else {
        const { rows: [a] } = await pool.query<{ id: number }>(
          'INSERT INTO authors (name) VALUES ($1) RETURNING id', [trimmed],
        );
        authorId = a.id;
      }
      await pool.query(
        'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [bookId, authorId, 'author'],
      );
    }

    // Link the book to the series
    await pool.query(
      `INSERT INTO book_series (book_id, series_id, position)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [bookId, seriesId, position],
    );
  }
}

interface GBVolume {
  id: string;
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    language?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
  seriesInfo?: {
    shortSeriesBookTitle?: string;
    bookSeries?: { orderNumber?: string }[];
  };
}
