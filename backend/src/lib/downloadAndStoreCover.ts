import pool from '../db';
import { uploadCover } from './r2';

// Downloads a cover URL and uploads it to R2. Returns the R2 URL, or null if
// R2 is not configured or the download fails.
export async function fetchAndUploadCover(coverUrl: string, force = false): Promise<string | null> {
  if (!process.env['R2_ACCOUNT_ID'] || !process.env['R2_ACCESS_KEY_ID'] || !process.env['R2_PUBLIC_URL']) return null;
  if (!force && coverUrl.startsWith(process.env['R2_PUBLIC_URL'])) return coverUrl;

  try {
    const response = await fetch(coverUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SFFantasyShelf/1.0)' },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // Reject placeholder images (Google's "no cover" stub is ~1.5 KB)
    if (buffer.length < 3000) return null;
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const { url } = await uploadCover(buffer, 'cover.jpg', contentType);
    return url;
  } catch {
    return null;
  }
}

export async function downloadAndStoreCover(bookId: number, coverUrl: string): Promise<void> {
  const r2Url = await fetchAndUploadCover(coverUrl);
  if (r2Url) {
    await pool.query('UPDATE books SET cover_url = $1 WHERE id = $2', [r2Url, bookId]);
  }
}

// Fetches a fresh cover URL from the Google Books API, or falls back to the
// direct content URL. Returns null if nothing is found.
async function fetchGoogleBooksCoverUrl(googleBooksId: string): Promise<string | null> {
  const apiKey = process.env['GOOGLE_BOOKS_API_KEY'];
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/books/v1/volumes/${googleBooksId}?key=${apiKey}&fields=volumeInfo/imageLinks`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SFFantasyShelf/1.0)' },
      });
      if (res.ok) {
        const data = await res.json() as { volumeInfo?: { imageLinks?: { thumbnail?: string; small?: string; medium?: string } } };
        const links = data.volumeInfo?.imageLinks;
        const raw = links?.medium ?? links?.small ?? links?.thumbnail;
        if (raw) return raw.replace('http://', 'https://').replace('zoom=1', 'zoom=2');
      }
    } catch {
      // fall through
    }
  }
  // Direct content URL with zoom=2 (larger than default zoom=1)
  return `https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
}

// Builds an Open Library large-cover URL from ISBN.
function openLibraryCoverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
}

// Used by the retry endpoint. Tries Google Books → Open Library → existing URL,
// force-bypassing the R2 guard each time.
export async function retryCoverForBook(bookId: number): Promise<string | null> {
  const { rows } = await pool.query<{
    cover_url: string | null;
    google_books_id: string | null;
    isbn13: string | null;
    isbn: string | null;
  }>(
    'SELECT cover_url, google_books_id, isbn13, isbn FROM books WHERE id = $1',
    [bookId],
  );
  if (!rows.length) return null;
  const { cover_url, google_books_id, isbn13, isbn } = rows[0];

  const attempts: string[] = [];

  if (google_books_id) {
    const gbUrl = await fetchGoogleBooksCoverUrl(google_books_id);
    if (gbUrl) attempts.push(gbUrl);
  }

  const isbnValue = isbn13 ?? isbn;
  if (isbnValue) {
    attempts.push(openLibraryCoverUrl(isbnValue));
  }

  if (cover_url) {
    attempts.push(cover_url);
  }

  for (const url of attempts) {
    const r2Url = await fetchAndUploadCover(url, true);
    if (r2Url) {
      await pool.query('UPDATE books SET cover_url = $1 WHERE id = $2', [r2Url, bookId]);
      return r2Url;
    }

    // R2 not configured or upload failed — still update with the direct URL if
    // it's different from what we have (so at least the browser can try it)
    if (url !== cover_url && !process.env['R2_ACCOUNT_ID']) {
      await pool.query('UPDATE books SET cover_url = $1 WHERE id = $2', [url, bookId]);
      return url;
    }
  }

  return cover_url;
}
