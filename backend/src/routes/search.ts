import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { extractSeries } from '../lib/extractSeries';

const router = Router();

export interface BookSearchResult {
  google_id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  published_at: string | null;
  page_count: number | null;
  isbn: string | null;
  isbn13: string | null;
  description: string | null;
  language: string;
  series_name: string | null;
  series_position: number | null;
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q) return res.json([]);

  const apiKey = process.env['GOOGLE_BOOKS_API_KEY'];
  const results = apiKey
    ? await searchGoogleBooks(q, apiKey)
    : await searchOpenLibrary(q);

  res.json(results);
}));

// ── Google Books ──────────────────────────────────────────────────────────────

async function searchGoogleBooks(q: string, apiKey: string): Promise<BookSearchResult[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=15&langRestrict=en&key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Google Books error ${response.status} for q="${q}"`);
    throw new Error('Book search unavailable');
  }

  const data = await response.json() as { items?: GBVolume[] };
  const items = data.items ?? [];

  return items.map(item => {
    const v = item.volumeInfo;
    const isbns = v.industryIdentifiers ?? [];
    const isbn10 = isbns.find(i => i.type === 'ISBN_10')?.identifier ?? null;
    const isbn13 = isbns.find(i => i.type === 'ISBN_13')?.identifier ?? null;

    const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
    const cover_url = rawCover
      ? rawCover.replace('http://', 'https://').replace('&zoom=1', '&zoom=2')
      : null;

    const { name: series_name, position: series_position } =
      extractSeries(v.title ?? '', v.subtitle, item.seriesInfo);

    return {
      google_id:       item.id,
      title:           v.title ?? 'Unknown Title',
      authors:         v.authors ?? [],
      cover_url,
      published_at:    v.publishedDate ?? null,
      page_count:      v.pageCount ?? null,
      isbn:            isbn10,
      isbn13,
      description:     v.description ?? null,
      language:        v.language ?? 'en',
      series_name,
      series_position,
    };
  });
}

// ── OpenLibrary fallback ──────────────────────────────────────────────────────

async function searchOpenLibrary(q: string): Promise<BookSearchResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=15&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,isbn,language,series,series_number`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`OpenLibrary error ${response.status} for q="${q}"`);
    throw new Error('Book search unavailable');
  }

  const data = await response.json() as { docs?: OLDoc[] };
  const docs = data.docs ?? [];

  return docs.map(doc => {
    const isbns: string[] = doc.isbn ?? [];
    const isbn10 = isbns.find(s => s.length === 10) ?? null;
    const isbn13 = isbns.find(s => s.length === 13) ?? null;
    const cover_url = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null;

    const series_name = doc.series?.[0] ?? null;
    const series_position = doc.series_number?.[0]
      ? parseFloat(doc.series_number[0])
      : null;

    return {
      google_id:       doc.key,
      title:           doc.title ?? 'Unknown Title',
      authors:         doc.author_name ?? [],
      cover_url,
      published_at:    doc.first_publish_year ? String(doc.first_publish_year) : null,
      page_count:      doc.number_of_pages_median ?? null,
      isbn:            isbn10,
      isbn13,
      description:     null,
      language:        normaliseLanguage(doc.language),
      series_name,
      series_position,
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseLanguage(langs: string[] | undefined): string {
  const code = langs?.[0]?.toLowerCase() ?? 'eng';
  const map: Record<string, string> = {
    eng: 'en', fre: 'fr', ger: 'de', spa: 'es', ita: 'it',
    por: 'pt', dut: 'nl', jpn: 'ja', chi: 'zh', pol: 'pl',
  };
  return map[code] ?? (code.length > 2 ? 'en' : code);
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
    bookSeries?: { seriesId?: string; seriesBookType?: string; orderNumber?: string }[];
  };
}

interface OLDoc {
  key: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  language?: string[];
  series?: string[];
  series_number?: string[];
}

export default router;
