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
// Uses OpenLibrary Search API — free, no key required, no rate-limit issues.

router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  if (!q) return res.json([]);

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=15&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,isbn,language`;

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`OpenLibrary error ${response.status} for q="${q}"`);
    return res.status(502).json({ error: 'Book search unavailable' });
  }

  const data = await response.json() as { docs?: OLDoc[] };
  const docs = data.docs ?? [];

  const results: BookSearchResult[] = docs.map(doc => {
    const isbns: string[] = doc.isbn ?? [];
    const isbn10  = isbns.find(s => s.length === 10) ?? null;
    const isbn13  = isbns.find(s => s.length === 13) ?? null;
    const cover_url = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null;

    return {
      google_id:    doc.key,                              // reuse field as opaque ID
      title:        doc.title ?? 'Unknown Title',
      authors:      doc.author_name ?? [],
      cover_url,
      published_at: doc.first_publish_year ? String(doc.first_publish_year) : null,
      page_count:   doc.number_of_pages_median ?? null,
      isbn:         isbn10,
      isbn13,
      description:  null,                                 // not in search endpoint
      language:     normaliseLanguage(doc.language),
    };
  });

  res.json(results);
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseLanguage(langs: string[] | undefined): string {
  const code = langs?.[0]?.toLowerCase() ?? 'eng';
  // Map 3-letter → 2-letter for common codes
  const map: Record<string, string> = {
    eng: 'en', fre: 'fr', ger: 'de', spa: 'es', ita: 'it',
    por: 'pt', dut: 'nl', jpn: 'ja', chi: 'zh', pol: 'pl',
  };
  return map[code] ?? (code.length > 2 ? 'en' : code);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OLDoc {
  key: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  language?: string[];
}

export default router;
