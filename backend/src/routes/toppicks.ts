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

export const GENRE_OPTIONS: { label: string; subject: string }[] = [
  { label: 'Sci-Fi',             subject: 'science_fiction'    },
  { label: 'Fantasy',            subject: 'fantasy'            },
  { label: 'Mystery',            subject: 'mystery'            },
  { label: 'Thriller',           subject: 'thriller'           },
  { label: 'Horror',             subject: 'horror'             },
  { label: 'Romance',            subject: 'romance'            },
  { label: 'Historical Fiction', subject: 'historical_fiction' },
  { label: 'Biography',          subject: 'biography'          },
  { label: 'Adventure',          subject: 'adventure'          },
  { label: 'Classic Literature', subject: 'classic_literature' },
];

const SUBJECT_MAP = new Map(GENRE_OPTIONS.map(g => [g.subject, g.label]));
const DEFAULT_SUBJECT = 'science_fiction';

// isbn-based cover URLs are reliable without a subject API call
const isbn = (code: string) => `https://covers.openlibrary.org/b/isbn/${code}-M.jpg`;

const CURATED: Record<string, Omit<TopPick, 'genre'>[]> = {
  science_fiction: [
    { key: 'sf1', title: 'Dune',                      author: 'Frank Herbert',       cover_url: isbn('9780441013593') },
    { key: 'sf2', title: 'Foundation',                 author: 'Isaac Asimov',        cover_url: isbn('9780553293357') },
    { key: 'sf3', title: "Ender's Game",               author: 'Orson Scott Card',    cover_url: isbn('9780812550702') },
    { key: 'sf4', title: 'The Left Hand of Darkness',  author: 'Ursula K. Le Guin',  cover_url: isbn('9780441478125') },
    { key: 'sf5', title: 'Neuromancer',                author: 'William Gibson',      cover_url: isbn('9780441569595') },
    { key: 'sf6', title: 'The Hitchhiker\'s Guide',    author: 'Douglas Adams',       cover_url: isbn('9780345391803') },
    { key: 'sf7', title: 'Hyperion',                   author: 'Dan Simmons',         cover_url: isbn('9780553283686') },
    { key: 'sf8', title: 'Childhood\'s End',           author: 'Arthur C. Clarke',    cover_url: isbn('9780345444059') },
  ],
  fantasy: [
    { key: 'fa1', title: 'The Name of the Wind',       author: 'Patrick Rothfuss',    cover_url: isbn('9780756404741') },
    { key: 'fa2', title: 'The Way of Kings',           author: 'Brandon Sanderson',   cover_url: isbn('9780765365279') },
    { key: 'fa3', title: 'A Wizard of Earthsea',       author: 'Ursula K. Le Guin',  cover_url: isbn('9780547773742') },
    { key: 'fa4', title: 'The Eye of the World',       author: 'Robert Jordan',       cover_url: isbn('9780812511819') },
    { key: 'fa5', title: 'The Lies of Locke Lamora',   author: 'Scott Lynch',         cover_url: isbn('9780553588941') },
    { key: 'fa6', title: 'American Gods',              author: 'Neil Gaiman',         cover_url: isbn('9780380789030') },
    { key: 'fa7', title: 'The Blade Itself',           author: 'Joe Abercrombie',     cover_url: isbn('9780316387316') },
    { key: 'fa8', title: 'Assassin\'s Apprentice',     author: 'Robin Hobb',          cover_url: isbn('9780553573398') },
  ],
  mystery: [
    { key: 'my1', title: 'And Then There Were None',   author: 'Agatha Christie',     cover_url: isbn('9780062073488') },
    { key: 'my2', title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson',  cover_url: isbn('9780307454546') },
    { key: 'my3', title: 'Gone Girl',                  author: 'Gillian Flynn',       cover_url: isbn('9780307588371') },
    { key: 'my4', title: 'The Girl on the Train',      author: 'Paula Hawkins',       cover_url: isbn('9781594634024') },
    { key: 'my5', title: 'Big Little Lies',            author: 'Liane Moriarty',      cover_url: isbn('9780425274866') },
    { key: 'my6', title: 'In the Woods',               author: 'Tana French',         cover_url: isbn('9780670038602') },
    { key: 'my7', title: 'The No. 1 Ladies\' Detective Agency', author: 'Alexander McCall Smith', cover_url: isbn('9781400034772') },
    { key: 'my8', title: 'Rebecca',                    author: 'Daphne du Maurier',   cover_url: isbn('9780380730407') },
  ],
  thriller: [
    { key: 'th1', title: 'The Silence of the Lambs',  author: 'Thomas Harris',       cover_url: isbn('9780312924584') },
    { key: 'th2', title: 'The Bourne Identity',        author: 'Robert Ludlum',       cover_url: isbn('9780553260783') },
    { key: 'th3', title: 'The Firm',                   author: 'John Grisham',        cover_url: isbn('9780385341981') },
    { key: 'th4', title: 'Killing Floor',              author: 'Lee Child',           cover_url: isbn('9780515122336') },
    { key: 'th5', title: 'The Hunt for Red October',   author: 'Tom Clancy',          cover_url: isbn('9780425133514') },
    { key: 'th6', title: 'Presumed Innocent',          author: 'Scott Turow',         cover_url: isbn('9780446359139') },
    { key: 'th7', title: 'The Day of the Jackal',      author: 'Frederick Forsyth',   cover_url: isbn('9780451211736') },
    { key: 'th8', title: 'All the President\'s Men',   author: 'Bob Woodward',        cover_url: isbn('9781476770512') },
  ],
  horror: [
    { key: 'ho1', title: 'The Shining',                author: 'Stephen King',        cover_url: isbn('9780307743657') },
    { key: 'ho2', title: 'It',                         author: 'Stephen King',        cover_url: isbn('9781501156700') },
    { key: 'ho3', title: 'Dracula',                    author: 'Bram Stoker',         cover_url: isbn('9780141439846') },
    { key: 'ho4', title: 'Frankenstein',               author: 'Mary Shelley',        cover_url: isbn('9780141439471') },
    { key: 'ho5', title: 'The Haunting of Hill House', author: 'Shirley Jackson',     cover_url: isbn('9780143039976') },
    { key: 'ho6', title: 'Interview with the Vampire', author: 'Anne Rice',           cover_url: isbn('9780345337603') },
    { key: 'ho7', title: 'Pet Sematary',               author: 'Stephen King',        cover_url: isbn('9780743412285') },
    { key: 'ho8', title: 'House of Leaves',            author: 'Mark Z. Danielewski', cover_url: isbn('9780375703768') },
  ],
  romance: [
    { key: 'ro1', title: 'Pride and Prejudice',        author: 'Jane Austen',         cover_url: isbn('9780141439518') },
    { key: 'ro2', title: 'Outlander',                  author: 'Diana Gabaldon',      cover_url: isbn('9780440212560') },
    { key: 'ro3', title: 'Me Before You',              author: 'Jojo Moyes',          cover_url: isbn('9780143124542') },
    { key: 'ro4', title: 'The Notebook',               author: 'Nicholas Sparks',     cover_url: isbn('9780446605236') },
    { key: 'ro5', title: 'Jane Eyre',                  author: 'Charlotte Brontë',    cover_url: isbn('9780141441146') },
    { key: 'ro6', title: 'The Bronze Horseman',        author: 'Paullina Simons',     cover_url: isbn('9780060959722') },
    { key: 'ro7', title: 'It Ends with Us',            author: 'Colleen Hoover',      cover_url: isbn('9781501110368') },
    { key: 'ro8', title: 'Wuthering Heights',          author: 'Emily Brontë',        cover_url: isbn('9780141439556') },
  ],
  historical_fiction: [
    { key: 'hf1', title: 'All the Light We Cannot See', author: 'Anthony Doerr',     cover_url: isbn('9781476746586') },
    { key: 'hf2', title: 'The Pillars of the Earth',   author: 'Ken Follett',         cover_url: isbn('9780451166890') },
    { key: 'hf3', title: 'Wolf Hall',                  author: 'Hilary Mantel',       cover_url: isbn('9780312429980') },
    { key: 'hf4', title: 'The Name of the Rose',       author: 'Umberto Eco',         cover_url: isbn('9780151442476') },
    { key: 'hf5', title: 'Shogun',                     author: 'James Clavell',       cover_url: isbn('9780440178002') },
    { key: 'hf6', title: 'The Bronze Bow',             author: 'Elizabeth George Speare', cover_url: isbn('9780395137192') },
    { key: 'hf7', title: 'Memoirs of a Geisha',        author: 'Arthur Golden',       cover_url: isbn('9780679781585') },
    { key: 'hf8', title: 'The Book Thief',             author: 'Markus Zusak',        cover_url: isbn('9780375831003') },
  ],
  biography: [
    { key: 'bi1', title: 'The Diary of a Young Girl',  author: 'Anne Frank',          cover_url: isbn('9780553296983') },
    { key: 'bi2', title: 'Long Walk to Freedom',       author: 'Nelson Mandela',      cover_url: isbn('9780316548182') },
    { key: 'bi3', title: 'Steve Jobs',                 author: 'Walter Isaacson',     cover_url: isbn('9781451648539') },
    { key: 'bi4', title: 'The Glass Castle',           author: 'Jeannette Walls',     cover_url: isbn('9780743247542') },
    { key: 'bi5', title: 'I Know Why the Caged Bird Sings', author: 'Maya Angelou',   cover_url: isbn('9780345514400') },
    { key: 'bi6', title: 'Educated',                   author: 'Tara Westover',       cover_url: isbn('9780399590528') },
    { key: 'bi7', title: 'Born a Crime',               author: 'Trevor Noah',         cover_url: isbn('9780399588198') },
    { key: 'bi8', title: 'When Breath Becomes Air',    author: 'Paul Kalanithi',      cover_url: isbn('9780812988406') },
  ],
  adventure: [
    { key: 'ad1', title: 'The Count of Monte Cristo',  author: 'Alexandre Dumas',     cover_url: isbn('9780140449266') },
    { key: 'ad2', title: 'Treasure Island',            author: 'Robert Louis Stevenson', cover_url: isbn('9780141321004') },
    { key: 'ad3', title: 'Into Thin Air',              author: 'Jon Krakauer',        cover_url: isbn('9780385494786') },
    { key: 'ad4', title: 'The Old Man and the Sea',    author: 'Ernest Hemingway',    cover_url: isbn('9780684830490') },
    { key: 'ad5', title: 'Life of Pi',                 author: 'Yann Martel',         cover_url: isbn('9780156027328') },
    { key: 'ad6', title: '20,000 Leagues Under the Sea', author: 'Jules Verne',       cover_url: isbn('9780140440416') },
    { key: 'ad7', title: 'Endurance',                  author: 'Alfred Lansing',      cover_url: isbn('9780465062881') },
    { key: 'ad8', title: 'Into the Wild',              author: 'Jon Krakauer',        cover_url: isbn('9780385486804') },
  ],
  classic_literature: [
    { key: 'cl1', title: 'To Kill a Mockingbird',      author: 'Harper Lee',          cover_url: isbn('9780060935467') },
    { key: 'cl2', title: '1984',                       author: 'George Orwell',       cover_url: isbn('9780451524935') },
    { key: 'cl3', title: 'The Great Gatsby',           author: 'F. Scott Fitzgerald', cover_url: isbn('9780743273565') },
    { key: 'cl4', title: 'Brave New World',            author: 'Aldous Huxley',       cover_url: isbn('9780060850524') },
    { key: 'cl5', title: 'Crime and Punishment',       author: 'Fyodor Dostoyevsky',  cover_url: isbn('9780140449136') },
    { key: 'cl6', title: 'The Brothers Karamazov',     author: 'Fyodor Dostoyevsky',  cover_url: isbn('9780374528379') },
    { key: 'cl7', title: 'Don Quixote',                author: 'Miguel de Cervantes', cover_url: isbn('9780142437230') },
    { key: 'cl8', title: 'Anna Karenina',              author: 'Leo Tolstoy',         cover_url: isbn('9780143035008') },
  ],
};

// Per-subject cache (OpenLibrary live results), expires after 24 hours
const cache = new Map<string, { data: TopPick[]; expiresAt: number }>();

router.get('/', asyncHandler(async (req, res) => {
  const raw      = typeof req.query['subjects'] === 'string' ? req.query['subjects'] : '';
  const requested = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => SUBJECT_MAP.has(s))
    .slice(0, 3);

  const subjects = requested.length ? requested : [DEFAULT_SUBJECT];

  const settled = await Promise.allSettled(subjects.map(s => fetchSubject(s)));
  const allBooks: TopPick[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') allBooks.push(...result.value);
  }

  const seen  = new Set<string>();
  const picks: TopPick[] = [];
  for (const b of allBooks) {
    if (picks.length >= 8) break;
    const key = b.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) { seen.add(key); picks.push(b); }
  }

  res.json(picks);
}));

router.get('/genres', (_req, res) => res.json(GENRE_OPTIONS));

async function fetchSubject(subject: string): Promise<TopPick[]> {
  const cached = cache.get(subject);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const label    = SUBJECT_MAP.get(subject) ?? subject;
  const curated  = (CURATED[subject] ?? []).map(b => ({ ...b, genre: label }));

  try {
    const url  = `https://openlibrary.org/subjects/${subject}.json?limit=8&sort=edition_count`;
    const resp = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'ZigsCodex/1.0 (book-tracking app)' },
    });

    if (resp.ok) {
      const data  = await resp.json() as { works?: OLWork[] };
      const live  = (data.works ?? [])
        .filter(w => w.cover_id)
        .slice(0, 8)
        .map(w => ({
          key:       w.key,
          title:     w.title,
          author:    w.authors?.[0]?.name ?? 'Unknown',
          cover_url: `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`,
          genre:     label,
        }));

      if (live.length >= 4) {
        cache.set(subject, { data: live, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        return live;
      }
    }
  } catch {
    // fall through to curated
  }

  console.log(`[toppicks] using curated list for ${subject}`);
  cache.set(subject, { data: curated, expiresAt: Date.now() + 60 * 60 * 1000 });
  return curated;
}

interface OLWork {
  key:       string;
  title:     string;
  authors?:  { name: string }[];
  cover_id?: number;
}

export default router;
