import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { extractSeries, isSameSeries } from './extractSeries';

const MODEL = 'claude-sonnet-4-5';

function toDate(s: string | undefined | null): string | null {
  if (!s) return null;
  return /^\d{4}$/.test(s.trim()) ? `${s.trim()}-01-01` : s;
}

// ── Google Books helpers ───────────────────────────────────────────────────────

async function insertBookAtPosition(
  seriesId: number,
  position: number,
  item: GBVolume,
): Promise<void> {
  // Guard: bail out if this series already has a book at this position.
  // Centralised here so every call path is protected regardless of outer checks.
  const posCheck = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM book_series WHERE series_id = $1 AND position = $2)',
    [seriesId, position],
  );
  if (posCheck.rows[0].exists) return;

  const v = item.volumeInfo;
  const isbns = v.industryIdentifiers ?? [];
  const isbn13 = isbns.find(i => i.type === 'ISBN_13')?.identifier ?? null;
  const isbn10  = isbns.find(i => i.type === 'ISBN_10')?.identifier  ?? null;

  let bookId: number | null = null;

  if (isbn13 || isbn10) {
    const found = await pool.query<{ id: number }>(
      `SELECT id FROM books WHERE (isbn13 = $1 AND isbn13 IS NOT NULL)
                               OR (isbn  = $2 AND isbn  IS NOT NULL) LIMIT 1`,
      [isbn13, isbn10],
    );
    if (found.rows.length) bookId = found.rows[0].id;
  }

  if (!bookId) {
    const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
    const cover_url = rawCover ? rawCover.replace('http://', 'https://') : null;
    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO books (title, isbn, isbn13, description, cover_url, published_at, page_count, language, google_books_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [v.title ?? 'Unknown Title', isbn10, isbn13, v.description ?? null, cover_url,
         toDate(v.publishedDate), v.pageCount ?? null, v.language ?? 'en', item.id ?? null],
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

  if (!bookId) return;

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

  await pool.query(
    'INSERT INTO book_series (book_id, series_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [bookId, seriesId, position],
  );
}

// ── Claude gap-fill ───────────────────────────────────────────────────────────

async function fillGapsWithClaude(
  seriesId: number,
  seriesName: string,
  foundPositions: Set<number>,
  googleApiKey: string,
): Promise<void> {
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicKey) return;

  let claudeBooks: { position: number; title: string; author: string }[] = [];
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'You are a science fiction and fantasy bibliographer with encyclopedic knowledge of book series. Respond ONLY with valid JSON — no markdown fences, no text outside the JSON object.',
      messages: [{
        role: 'user',
        content: `List every main-sequence book in the "${seriesName}" series in publication order. Exclude companion books, encyclopedias, and short story collections unless they carry an official series number. Return ONLY this JSON:
{
  "books": [
    { "position": 1, "title": "Book Title", "author": "Author Name" }
  ]
}`,
      }],
    });

    const text = message.content.find(b => b.type === 'text')?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as {
      books?: { position: number; title: string; author: string }[];
    };
    claudeBooks = parsed.books ?? [];
  } catch (err) {
    console.error(`Claude series lookup failed for "${seriesName}":`, err);
    return;
  }

  for (const book of claudeBooks) {
    const pos = parseFloat(String(book.position));
    if (!isFinite(pos) || pos <= 0) continue;

    // Skip positions we already have (exact or integer match for integer positions)
    const intPos = Math.floor(pos);
    if (foundPositions.has(pos) || (pos === intPos && foundPositions.has(intPos))) continue;

    // Also skip if a book_series row already exists for this position
    const posCheck = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM book_series WHERE series_id = $1 AND position = $2)',
      [seriesId, pos],
    );
    if (posCheck.rows[0].exists) continue;

    // Search Google Books for this specific title
    const lastName = book.author.split(' ').pop() ?? book.author;
    const q = encodeURIComponent(`intitle:"${book.title}" inauthor:"${lastName}"`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&langRestrict=en&key=${googleApiKey}`;

    let gbItem: GBVolume | null = null;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { items?: GBVolume[] };
        gbItem = data.items?.[0] ?? null;
      }
    } catch { /* skip if fetch fails */ }

    if (gbItem) {
      await insertBookAtPosition(seriesId, pos, gbItem);
    }

    foundPositions.add(pos);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function populateSeriesBooks(
  seriesId: number,
  seriesName: string,
  googleBooksId: string | null,
): Promise<void> {
  const apiKey = process.env['GOOGLE_BOOKS_API_KEY'];
  if (!apiKey) return;

  const allItems: GBVolume[] = [];

  // Source 1: associated endpoint — Google's "books related to this volume" graph.
  if (googleBooksId) {
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(googleBooksId)}/associated?maxResults=40&key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as { items?: GBVolume[] };
      allItems.push(...(data.items ?? []));
    }
  }

  // Source 2: text search by series name across two pages.
  const q = encodeURIComponent(`"${seriesName}"`);
  const base = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=40&orderBy=relevance&key=${apiKey}`;
  const fetchPage = async (startIndex: number): Promise<{ items?: GBVolume[] }> => {
    const res = await fetch(`${base}&startIndex=${startIndex}`);
    if (!res.ok) return {};
    return res.json() as Promise<{ items?: GBVolume[] }>;
  };
  const [data1, data2] = await Promise.all([fetchPage(0), fetchPage(40)]);
  allItems.push(...(data1.items ?? []), ...(data2.items ?? []));

  // Deduplicate by Google Books volume ID
  const seen = new Set<string>();
  const items = allItems.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Phase 1: process Google Books results
  for (const item of items) {
    const v = item.volumeInfo;
    const { name: detectedSeries, position } = extractSeries(
      v.title ?? '', v.subtitle, item.seriesInfo,
    );

    const nameMatch = detectedSeries && isSameSeries(detectedSeries, seriesName);
    const apiOrderNumber = item.seriesInfo?.bookSeries?.[0]?.orderNumber;
    if (!nameMatch && !apiOrderNumber) continue;
    if (!position) continue;

    await insertBookAtPosition(seriesId, position, item);
  }

  // Phase 2: ask Claude to identify gaps and fill them via targeted title search
  const { rows: posRows } = await pool.query<{ position: number }>(
    'SELECT position FROM book_series WHERE series_id = $1 AND position IS NOT NULL',
    [seriesId],
  );
  const foundPositions = new Set(posRows.map(r => Number(r.position)));

  if (foundPositions.size > 0) {
    await fillGapsWithClaude(seriesId, seriesName, foundPositions, apiKey);
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
