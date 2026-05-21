import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

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
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q) return res.json([]);

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&langRestrict=en`;
  const response = await fetch(url);
  if (!response.ok) return res.status(502).json({ error: 'Google Books unavailable' });

  const data = await response.json() as { items?: GoogleVolume[] };
  const items = data.items ?? [];

  const results: BookSearchResult[] = items.map(item => {
    const v = item.volumeInfo;
    const isbns = v.industryIdentifiers ?? [];
    const isbn10 = isbns.find(i => i.type === 'ISBN_10')?.identifier ?? null;
    const isbn13 = isbns.find(i => i.type === 'ISBN_13')?.identifier ?? null;

    // Use HTTPS and larger thumbnail
    const rawCover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
    const cover_url = rawCover ? rawCover.replace('http://', 'https://').replace('&zoom=1', '&zoom=2') : null;

    // published_at: Google returns "2001", "2001-01", or "2001-01-15"
    const published_at = v.publishedDate ?? null;

    return {
      google_id:    item.id,
      title:        v.title ?? 'Unknown Title',
      authors:      v.authors ?? [],
      cover_url,
      published_at,
      page_count:   v.pageCount ?? null,
      isbn:         isbn10,
      isbn13,
      description:  v.description ?? null,
      language:     v.language ?? 'en',
    };
  });

  res.json(results);
}));

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoogleVolume {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    language?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
}

export default router;
