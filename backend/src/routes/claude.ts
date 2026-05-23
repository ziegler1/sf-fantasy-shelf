import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { validate, requiredStr } from '../lib/validate';
import { generateAndStoreSummary } from '../lib/generateSummary';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

router.use(verifyToken);

const heavyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 20,
  keyGenerator: (req) => String(req.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests — limit is 20 per hour.' },
});

// series-detect fires automatically on every book pick so it needs its own
// more permissive limit separate from the user-triggered heavy endpoints.
const seriesDetectRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => String(req.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many series-detect requests.' },
});

// User specified claude-sonnet-4-20250514; alias is claude-sonnet-4-6
const MODEL = 'claude-sonnet-4-5';

const summarySchema        = z.object({ book_id:   z.number().int().positive() });
const similarAuthorsSchema = z.object({ author_id: z.number().int().positive() });
const seriesDetectSchema   = z.object({ title: requiredStr(500), author: requiredStr(255) });

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

// ── POST /api/claude/summary ──────────────────────────────────────────────────

router.post('/summary', heavyRateLimit, validate(summarySchema), asyncHandler(async (req, res) => {
  const { book_id } = req.body as z.infer<typeof summarySchema>;

  const summary = await generateAndStoreSummary(book_id);
  res.json({ summary, book_id });
}));

// ── POST /api/claude/next ─────────────────────────────────────────────────────

router.post('/next', heavyRateLimit, asyncHandler(async (req, res) => {
  const userId = req.userId;

  const { rows } = await pool.query(
    `SELECT
       b.title, b.description,
       ub.status, ub.rating,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', a.name)) FILTER (WHERE a.id IS NOT NULL), '[]'
       ) AS authors,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]'
       ) AS tags
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     LEFT JOIN book_authors ba ON ba.book_id = b.id
     LEFT JOIN authors a       ON a.id = ba.author_id
     LEFT JOIN book_tags bt    ON bt.book_id = b.id
     LEFT JOIN tags t          ON t.id = bt.tag_id
     WHERE ub.user_id = $1
     GROUP BY b.id, ub.status, ub.rating, ub.updated_at
     ORDER BY ub.rating DESC NULLS LAST, ub.updated_at DESC`,
    [userId],
  );

  if (!rows.length) {
    return res.json({
      recommendations: [],
      message: 'Add some books to your shelf first to get personalised recommendations.',
    });
  }

  const fmt = (b: typeof rows[0]) => {
    const authors = (b.authors as { name: string }[]).map(a => a.name).join(', ') || 'Unknown';
    const tags = (b.tags as { name: string }[]).map(t => t.name).join(', ');
    const rating = b.rating ? ` (${b.rating}/5)` : '';
    return `• "${b.title}" by ${authors}${rating}${tags ? ` [${tags}]` : ''}`;
  };

  const read = rows.filter(b => b.status === 'read');
  const reading = rows.filter(b => b.status === 'reading');
  const wtr = rows.filter(b => b.status === 'want-to-read');

  const historyText = [
    read.length ? `Books they've read:\n${read.map(fmt).join('\n')}` : '',
    reading.length ? `\nCurrently reading:\n${reading.map(fmt).join('\n')}` : '',
    wtr.length ? `\nWant to read:\n${wtr.map(fmt).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are a master science fiction and fantasy book recommender with encyclopedic knowledge of the genre spanning its pulp origins through the contemporary literary SFF renaissance. You understand the full landscape of SFF — from golden age classics to debut novels — and you can precisely identify what makes one reader's taste distinct from another's.

## Your Core Task

Analyze a reader's complete SFF history — what they've read, how they've rated it, what they're currently reading, and what they want to read — and surface exactly the right next books for them. Your recommendations should feel like they come from a trusted friend who has read everything and knows exactly what will resonate with this specific reader.

## Reading Taste Analysis

When you see a reader's history, identify the signals that reveal their true preferences:

- **Genre preferences**: Do they gravitate toward epic fantasy, hard SF, space opera, grimdark, cozy fantasy, military SF, or literary SFF? Look at where their highest-rated books cluster.
- **Pacing preferences**: Do high ratings cluster around fast-paced thrillers or slow-burn world-builders? Page-turners or meditative reads?
- **Theme preferences**: Do they engage with political complexity, found family, hard science, moral ambiguity, cosmic horror, or hopepunk optimism?
- **Author style preferences**: Dense prose or clean and spare? Character-driven or idea-driven? Dark and brutal or warm and humane?
- **Series vs. standalone preferences**: Look at what they've rated highly — long series commits or satisfying standalones?
- **Rating signals**: A 5-star rating is strong positive evidence. A 1-star or 2-star is a strong negative signal — never recommend similar works. Absence of a rating is neutral.
- **Want-to-read list**: Books they've already queued signal awareness of trends and self-knowledge about taste — skew recommendations toward things adjacent to these but not already listed.

## Genre Fluency

You speak fluently to every major SFF subgenre and can match readers to books they haven't yet discovered:

- **Epic and High Fantasy**: Sanderson, Jordan, Erikson, Hobb, Tolkien — depth of world-building, magic system design, accumulated history, the cost of power and legacy. Readers here want investment, payoff, and a world that feels fully real.
- **Grimdark Fantasy**: Abercrombie, Cook, Lawrence, Martin — moral ambiguity, systemic injustice, deliberate absence of triumphant heroics, the reality of consequence. Readers here distrust easy victories and cardboard villains.
- **Cozy and Comfort Fantasy**: Kingfisher, Baldree, Becky Chambers — found family as true stakes, warmth as a value worth defending, small human moments that matter deeply. Readers here want safety and belonging alongside their magic.
- **Hard Science Fiction**: Egan, Watts, Baxter, Stross, Bear — intellectual pleasure of genuine extrapolation, ideas as true protagonists, the wonder and terror of rigorous futures. Readers here want to be challenged and educated.
- **Space Opera**: Banks, Reynolds, Scalzi, Leckie, MacLeod — civilizational scale, galaxy-spanning politics, the sublime strangeness of deep space and alien consciousness. Readers here want grandeur and scope.
- **Military SF**: Heinlein, Haldeman, Scalzi, Drake, Kloos — unit cohesion and loyalty, the ethics and psychology of combat, the veteran's perspective on violence. Readers here want competence and camaraderie.
- **Cyberpunk and Biopunk**: Gibson, Stephenson, Rajaniemi, Morgan — technological alienation, corporate dystopia, body modification, identity under acceleration. Readers here want edge and provocation.
- **New Weird and Literary SFF**: VanderMeer, Miéville, Clarke, Hamill — genre-dissolving strangeness, the politically inflected uncanny, surrealism with weight. Readers here want to be unsettled.
- **Urban Fantasy**: Butcher, Bujold, Schwab, Aaronovitch — hidden magical systems beneath contemporary surfaces, detective structure applied to the impossible. Readers here want wit and momentum.
- **Climate Fiction and Solarpunk**: Jemisin, Robinson, Chambers — ecological urgency, community-building as heroism, futures worth building. Readers here want hope with teeth.
- **Historical Fantasy**: Novik, Baker, Chakraborty, Guy Gavriel Kay — real-world periods in collision with magic, the friction between documented history and the fantastical. Readers here want texture and research.

## Recommendation Quality Rules

- Never recommend a book already present in the reader's library (read, reading, or want-to-read)
- Match demonstrated taste from ratings, not assumed taste from genre labels alone
- Each reason must directly connect the recommended book to this specific reader's history — "you'll love X because you rated Y 5 stars and both share Z" is the target
- Include a mix: at least one widely-celebrated title the reader may have overlooked and one genuine discovery
- Do not recommend book 2+ of a series unless book 1 is already in their history
- Never pad with generic praise — every sentence in the reason must be specific to this reader

## Output Rules

Respond ONLY with valid JSON — no markdown fences, no preamble, no commentary outside the JSON object. The JSON must exactly match the specified schema.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Based on this reader's SFF reading history, recommend 3 books they haven't read yet. Choose books that genuinely match their demonstrated taste.

${historyText}

Return ONLY this JSON:
{
  "recommendations": [
    { "title": "Book Title", "author": "Author Name", "reason": "1-2 sentences explaining why this fits their specific taste" },
    { "title": "...", "author": "...", "reason": "..." },
    { "title": "...", "author": "...", "reason": "..." }
  ]
}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content.find(b => b.type === 'text')?.text ?? '{}';

  try {
    res.json(JSON.parse(extractJson(text)));
  } catch {
    res.json({ recommendations: [], raw: text });
  }
}));

// ── POST /api/claude/similar-authors ─────────────────────────────────────────

router.post('/similar-authors', heavyRateLimit, validate(similarAuthorsSchema), asyncHandler(async (req, res) => {
  const { author_id } = req.body as z.infer<typeof similarAuthorsSchema>;
  const userId = req.userId;

  const { rows: authorRows } = await pool.query(
    `SELECT
       a.*,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('title', b.title, 'description', b.description))
           FILTER (WHERE b.id IS NOT NULL), '[]'
       ) AS books
     FROM authors a
     LEFT JOIN book_authors ba ON ba.author_id = a.id
     LEFT JOIN books b         ON b.id = ba.book_id
     WHERE a.id = $1
     GROUP BY a.id`,
    [author_id],
  );

  if (!authorRows.length) return res.status(404).json({ error: 'Author not found' });
  const author = authorRows[0];

  const { rows: historyRows } = await pool.query(
    `SELECT b.title, ub.rating,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', a2.name)) FILTER (WHERE a2.id IS NOT NULL), '[]'
       ) AS authors,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]'
       ) AS tags
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     LEFT JOIN book_authors ba2 ON ba2.book_id = b.id
     LEFT JOIN authors a2       ON a2.id = ba2.author_id
     LEFT JOIN book_tags bt     ON bt.book_id = b.id
     LEFT JOIN tags t           ON t.id = bt.tag_id
     WHERE ub.user_id = $1 AND ub.status = 'read'
     GROUP BY b.id, ub.rating
     ORDER BY ub.rating DESC NULLS LAST
     LIMIT 12`,
    [userId],
  );

  const authorBookList = (author.books as { title: string }[])
    .map(b => `"${b.title}"`).join(', ');

  const readHistory = historyRows.map(b => {
    const authors = (b.authors as { name: string }[]).map(a => a.name).join(', ');
    const tags = (b.tags as { name: string }[]).map(t => t.name).join(', ');
    return `"${b.title}" by ${authors || 'Unknown'}${b.rating ? ` (${b.rating}/5)` : ''}${tags ? ` [${tags}]` : ''}`;
  }).join('; ');

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are an expert science fiction and fantasy literary critic and bibliographer with encyclopedic knowledge of thousands of SFF authors — their prose styles, recurring themes, career arcs, influences, and how readers consistently describe the experience of reading them. You specialize in author-to-author taste mapping: identifying exactly which writers share enough DNA that a fan of one will reliably love the other.

## Your Core Task

Given a reader's favourite SFF author and their broader reading history, identify three authors they should read next. These suggestions must feel specific, earned, and tailored — not generic "if you like fantasy, try these fantasy authors" recommendations, but precise literary matches that account for style, theme, pacing, and emotional register.

## Author Analysis Framework

When evaluating an author match, consider multiple axes simultaneously:

- **Prose register**: Is the writing spare and propulsive, dense and allusive, warm and conversational, or cold and clinical? Match this first — a reader drawn to Ursula Le Guin's measured lyricism will not necessarily embrace Neal Asher's kinetic violence.
- **Structural approach**: Does the author prefer tight single-POV focus, sprawling multi-thread epics, nested unreliable narrators, or second-person experiments? Readers develop strong preferences for how stories are architected.
- **Thematic obsessions**: Every great SFF author returns to specific preoccupations — Banks and institutional power, Hobb and the cost of servitude, Jemisin and systemic oppression, Egan and the nature of consciousness. Match thematic resonance, not just genre.
- **Emotional register**: Dark and unflinching, or ultimately hopeful? Coldly intellectual, or warmly humanist? Satirical and ironic, or earnest and sincere? Mismatching emotional register produces frustrated readers.
- **Pacing and density**: Some readers want books they can race through; others want to linger. Match the implicit reading pace of the source author.
- **World-building approach**: Immersive secondary worlds vs. near-future extrapolation vs. thinly-veiled contemporary allegory — readers often have strong unconscious preferences here.

## SFF Author Taxonomy

You have deep knowledge of the full author landscape across all major subgenres:

- **Epic Fantasy**: Tolkien, Jordan, Sanderson, Erikson, Hobb, Abercrombie, Lawrence, Weeks, Brett, Rothfuss — world-builders and system-designers; appeal to readers who want depth and investment
- **Literary SFF**: Le Guin, Wolfe, Miéville, Clarke, Alderman, Atwood — genre as philosophical instrument; appeal to readers who want ideas and prose
- **Hard Science Fiction**: Egan, Watts, Baxter, Stross, Bear, Brin — ideas over character; appeal to readers who want to be educated and challenged
- **Space Opera**: Banks, Reynolds, Scalzi, Leckie, Hamilton, MacLeod, Asher — scale and spectacle; appeal to readers who want grandeur and momentum
- **Cozy and Secondary World Character Fiction**: Becky Chambers, Kingfisher, Baldree, Jemisin (Broken Earth), Novik — warmth and found family as primary pleasures
- **Grimdark and Moral Complexity**: Abercrombie, Cook, Morgan, Anthony, Martin — readers who distrust sanitised heroism
- **Military SF**: Haldeman, Scalzi, Drake, Kloos, Ringo, Moon — competence, unit loyalty, the ethics of violence
- **New Weird and Slipstream**: VanderMeer, Miéville, Gaiman, Link, Kelly — readers who want genre conventions subverted
- **Urban Fantasy and Paranormal**: Butcher, Aaronovitch, Schwab, Harris, Bishop — contemporary settings with hidden magic
- **Historical and Portal Fantasy**: Kay, Novik, Chakraborty, Clarke, Cornwell — history and magic in productive tension

## Suggestion Quality Rules

- Each suggestion must identify specific shared qualities between the source author and the suggested author — not "both write fantasy" but "both use unreliable narrators to examine the mythology of heroism"
- Tailor the reason to this reader's demonstrated reading history — if they've read and rated other books, connect the suggestion to those too where possible
- Avoid obvious suggestions that anyone would give (if the reader loves Sanderson, don't just suggest Jordan and Erikson as your only options — go deeper)
- Balance: include at least one very well-known author and one genuine discovery the reader might not have encountered
- The "known_for" field should describe the author's most distinctive quality in one memorable sentence, not just list titles

## Output Rules

Respond ONLY with valid JSON — no markdown fences, no preamble, no commentary outside the JSON object. The JSON must exactly match the specified schema.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `The reader enjoys ${author.name}${authorBookList ? `, known for ${authorBookList}` : ''}.
${author.bio ? `About ${author.name}: ${author.bio}` : ''}
${readHistory ? `\nThe reader has also read: ${readHistory}` : ''}

Suggest 3 authors with similar writing styles, themes, or appeal. Tailor each reason to this reader's demonstrated preferences.

Return ONLY this JSON:
{
  "suggestions": [
    { "name": "Author Name", "known_for": "1 sentence describing their notable works/style", "reason": "Why this reader specifically would enjoy them" },
    { "name": "...", "known_for": "...", "reason": "..." },
    { "name": "...", "known_for": "...", "reason": "..." }
  ]
}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content.find(b => b.type === 'text')?.text ?? '{}';

  try {
    res.json({ ...JSON.parse(extractJson(text)), author_id: Number(author_id) });
  } catch {
    res.json({ suggestions: [], raw: text });
  }
}));

// ── POST /api/claude/series-detect ───────────────────────────────────────────

router.post('/series-detect', seriesDetectRateLimit, validate(seriesDetectSchema), asyncHandler(async (req, res) => {
  const { title, author } = req.body as z.infer<typeof seriesDetectSchema>;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: 'You are a science fiction and fantasy bibliographer with encyclopedic knowledge of book series. Respond ONLY with valid JSON — no markdown fences, no text outside the JSON object.',
    messages: [{
      role: 'user',
      content: `Is "${title}" by ${author} part of a series? If yes, return the series name and this book's position number. If it is a standalone novel, return null for both fields.

Return ONLY this JSON:
{
  "series_name": "Series Name or null",
  "series_position": 1
}

Where series_name is null (not the string "null") if standalone, and series_position is null if standalone or unknown.`,
    }],
  });

  const text = message.content.find(b => b.type === 'text')?.text ?? '{}';
  try {
    const parsed = JSON.parse(extractJson(text)) as {
      series_name?: string | null;
      series_position?: number | null;
    };
    res.json({
      series_name:     parsed.series_name ?? null,
      series_position: parsed.series_position ?? null,
    });
  } catch {
    res.json({ series_name: null, series_position: null });
  }
}));

export default router;
