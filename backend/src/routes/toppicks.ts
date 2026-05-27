import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

export interface TopPick {
  key:       string;
  title:     string;
  author:    string;
  cover_url: string | null;
  genre:     string;
}

// Allowlist of OpenLibrary subject slugs → display labels
export const GENRE_OPTIONS: { label: string; subject: string }[] = [
  { label: 'Sci-Fi',             subject: 'science_fiction'   },
  { label: 'Fantasy',            subject: 'fantasy'           },
  { label: 'Mystery',            subject: 'mystery'           },
  { label: 'Thriller',           subject: 'thriller'          },
  { label: 'Horror',             subject: 'horror'            },
  { label: 'Romance',            subject: 'romance'           },
  { label: 'Historical Fiction', subject: 'historical_fiction'},
  { label: 'Biography',          subject: 'biography'         },
  { label: 'Adventure',          subject: 'adventure'         },
  { label: 'Classic Literature', subject: 'classic_literature'},
];

const SUBJECT_MAP = new Map(GENRE_OPTIONS.map(g => [g.subject, g.label]));
const DEFAULT_SUBJECTS = ['science_fiction', 'fantasy'];

const FALLBACK: TopPick[] = [
  { key: 'OL1a', title: 'Dune',                      author: 'Frank Herbert',     cover_url: 'https://covers.openlibrary.org/b/id/9255566-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL2a', title: 'The Name of the Wind',       author: 'Patrick Rothfuss',  cover_url: 'https://covers.openlibrary.org/b/id/9893548-M.jpg',  genre: 'Fantasy' },
  { key: 'OL3a', title: 'Foundation',                 author: 'Isaac Asimov',      cover_url: 'https://covers.openlibrary.org/b/id/9232322-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL4a', title: 'The Way of Kings',           author: 'Brandon Sanderson', cover_url: 'https://covers.openlibrary.org/b/id/10527843-M.jpg', genre: 'Fantasy' },
  { key: 'OL5a', title: "Ender's Game",               author: 'Orson Scott Card',  cover_url: 'https://covers.openlibrary.org/b/id/8225276-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL6a', title: 'The Eye of the World',       author: 'Robert Jordan',     cover_url: 'https://covers.openlibrary.org/b/id/9255116-M.jpg',  genre: 'Fantasy' },
  { key: 'OL7a', title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', cover_url: 'https://covers.openlibrary.org/b/id/9255568-M.jpg',  genre: 'Sci-Fi'  },
  { key: 'OL8a', title: 'A Wizard of Earthsea',      author: 'Ursula K. Le Guin', cover_url: 'https://covers.openlibrary.org/b/id/8910987-M.jpg',  genre: 'Fantasy' },
];

// Per-subject cache entries keyed by subject slug, expire after 24 hours
const cache = new Map<string, { data: TopPick[]; expiresAt: number }>();

router.get('/', asyncHandler(async (req, res) => {
  // Parse and validate requested subjects (max 3)
  const raw      = typeof req.query['subjects'] === 'string' ? req.query['subjects'] : '';
  const requested = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => SUBJECT_MAP.has(s))
    .slice(0, 3);

  const subjects = requested.length ? requested : DEFAULT_SUBJECTS;

  try {
    const settled = await Promise.allSettled(subjects.map(s => fetchSubject(s)));
    const allBooks: TopPick[] = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') allBooks.push(...result.value);
    }

    if (!allBooks.length) {
      console.warn(`[toppicks] no results for subjects=${subjects.join(',')}, using fallback`);
      return res.json(FALLBACK);
    }

    const seen  = new Set<string>();
    const picks: TopPick[] = [];
    for (const b of allBooks) {
      if (picks.length >= 8) break;
      const key = b.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) { seen.add(key); picks.push(b); }
    }

    res.json(picks);
  } catch (err) {
    console.error('[toppicks] fetch failed, using fallback:', err);
    res.json(FALLBACK);
  }
}));

// Also expose the genre options list so the frontend can stay in sync
router.get('/genres', (_req, res) => res.json(GENRE_OPTIONS));

async function fetchSubject(subject: string): Promise<TopPick[]> {
  const cached = cache.get(subject);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const url  = `https://openlibrary.org/subjects/${subject}.json?limit=8&sort=edition_count`;
  const resp = await fetch(url, {
    signal:  AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'ZigsCodex/1.0 (book-tracking app)' },
  });
  if (!resp.ok) throw new Error(`OpenLibrary ${resp.status} for subject=${subject}`);

  const data  = await resp.json() as { works?: OLWork[] };
  const label = SUBJECT_MAP.get(subject) ?? subject;

  const picks = (data.works ?? []).slice(0, 6).map(w => ({
    key:       w.key,
    title:     w.title,
    author:    w.authors?.[0]?.name ?? 'Unknown',
    cover_url: w.cover_id
      ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`
      : null,
    genre: label,
  }));

  cache.set(subject, { data: picks, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return picks;
}

interface OLWork {
  key:       string;
  title:     string;
  authors?:  { name: string }[];
  cover_id?: number;
}

export default router;
