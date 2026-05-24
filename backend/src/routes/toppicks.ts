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

const FALLBACK: TopPick[] = [
  { key: 'OL1a', title: 'Dune',                        author: 'Frank Herbert',       cover_url: 'https://covers.openlibrary.org/b/id/9255566-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL2a', title: 'The Name of the Wind',         author: 'Patrick Rothfuss',    cover_url: 'https://covers.openlibrary.org/b/id/9893548-M.jpg',  genre: 'Fantasy' },
  { key: 'OL3a', title: 'Foundation',                   author: 'Isaac Asimov',        cover_url: 'https://covers.openlibrary.org/b/id/9232322-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL4a', title: 'The Way of Kings',             author: 'Brandon Sanderson',   cover_url: 'https://covers.openlibrary.org/b/id/10527843-M.jpg', genre: 'Fantasy' },
  { key: 'OL5a', title: 'Ender\'s Game',                author: 'Orson Scott Card',    cover_url: 'https://covers.openlibrary.org/b/id/8225276-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL6a', title: 'The Eye of the World',         author: 'Robert Jordan',       cover_url: 'https://covers.openlibrary.org/b/id/9255116-M.jpg',  genre: 'Fantasy' },
  { key: 'OL7a', title: 'The Left Hand of Darkness',   author: 'Ursula K. Le Guin',   cover_url: 'https://covers.openlibrary.org/b/id/9255568-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL8a', title: 'A Wizard of Earthsea',        author: 'Ursula K. Le Guin',   cover_url: 'https://covers.openlibrary.org/b/id/8910987-M.jpg',  genre: 'Fantasy' },
];

// 24-hour in-memory cache — same for every user, no auth needed
let cache: { data: TopPick[]; expiresAt: number } | null = null;

router.get('/', asyncHandler(async (_req, res) => {
  if (cache && Date.now() < cache.expiresAt) {
    return res.json(cache.data);
  }

  try {
    const [sf, fantasy] = await Promise.allSettled([
      fetchSubject('science_fiction', 'Sci-Fi'),
      fetchSubject('fantasy',         'Fantasy'),
    ]);

    const sfBooks      = sf.status      === 'fulfilled' ? sf.value      : [];
    const fantasyBooks = fantasy.status === 'fulfilled' ? fantasy.value : [];

    if (!sfBooks.length && !fantasyBooks.length) {
      console.warn('[toppicks] Open Library returned no results, using fallback');
      return res.json(FALLBACK);
    }

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
  } catch (err) {
    console.error('[toppicks] Open Library fetch failed, using fallback:', err);
    res.json(FALLBACK);
  }
}));

async function fetchSubject(subject: string, genre: TopPick['genre']): Promise<TopPick[]> {
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=6&sort=edition_count`;
  const resp = await fetch(url, {
    signal:  AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'ZigsCodex/1.0 (book-tracking app)' },
  });
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
