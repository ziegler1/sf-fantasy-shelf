import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

export interface TopPick {
  key:       string;
  title:     string;
  author:    string;
  cover_url: string | null;
  genre:     'Sci-Fi' | 'Fantasy';
}

// 24-hour in-memory cache — same for every user, no auth needed
let cache: { data: TopPick[]; expiresAt: number } | null = null;

router.get('/', asyncHandler(async (_req, res) => {
  if (cache && Date.now() < cache.expiresAt) {
    return res.json(cache.data);
  }

  const [sf, fantasy] = await Promise.allSettled([
    fetchSubject('science_fiction', 'Sci-Fi'),
    fetchSubject('fantasy',         'Fantasy'),
  ]);

  const sfBooks      = sf.status      === 'fulfilled' ? sf.value      : [];
  const fantasyBooks = fantasy.status === 'fulfilled' ? fantasy.value : [];

  // Interleave Sci-Fi and Fantasy, dedupe by normalised title, cap at 8
  const seen  = new Set<string>();
  const picks: TopPick[] = [];
  const max   = Math.max(sfBooks.length, fantasyBooks.length);

  for (let i = 0; i < max && picks.length < 8; i++) {
    for (const book of [sfBooks[i], fantasyBooks[i]]) {
      if (!book || picks.length >= 8) continue;
      const key = book.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) { seen.add(key); picks.push(book); }
    }
  }

  cache = { data: picks, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  res.json(picks);
}));

async function fetchSubject(subject: string, genre: TopPick['genre']): Promise<TopPick[]> {
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=6&sort=edition_count`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`OpenLibrary ${resp.status} for subject=${subject}`);

  const data = await resp.json() as { works?: OLWork[] };
  return (data.works ?? []).slice(0, 6).map(w => ({
    key:       w.key,
    title:     w.title,
    author:    w.authors?.[0]?.name ?? 'Unknown',
    cover_url: w.cover_id
      ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`
      : null,
    genre,
  }));
}

interface OLWork {
  key:      string;
  title:    string;
  authors?: { name: string }[];
  cover_id?: number;
}

export default router;
