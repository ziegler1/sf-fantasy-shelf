import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

// User specified claude-sonnet-4-20250514; alias is claude-sonnet-4-6
const MODEL = 'claude-sonnet-4-5';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

// ── POST /api/claude/summary ──────────────────────────────────────────────────

router.post('/summary', asyncHandler(async (req, res) => {
  const { book_id } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id is required' });

  const { rows } = await pool.query(
    `SELECT
       b.*,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', a.name, 'role', ba.role))
           FILTER (WHERE a.id IS NOT NULL), '[]'
       ) AS authors,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'position', bs.position))
           FILTER (WHERE s.id IS NOT NULL), '[]'
       ) AS series,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('name', t.name))
           FILTER (WHERE t.id IS NOT NULL), '[]'
       ) AS tags,
       CASE WHEN ub.id IS NOT NULL
         THEN jsonb_build_object('status', ub.status, 'rating', ub.rating)
         ELSE NULL
       END AS user_book
     FROM books b
     LEFT JOIN book_authors ba ON ba.book_id = b.id
     LEFT JOIN authors a       ON a.id = ba.author_id
     LEFT JOIN book_series bs  ON bs.book_id = b.id
     LEFT JOIN series s        ON s.id = bs.series_id
     LEFT JOIN book_tags bt    ON bt.book_id = b.id
     LEFT JOIN tags t          ON t.id = bt.tag_id
     LEFT JOIN user_books ub   ON ub.book_id = b.id AND ub.user_id = 1
     WHERE b.id = $1
     GROUP BY b.id, ub.id`,
    [book_id],
  );

  if (!rows.length) return res.status(404).json({ error: 'Book not found' });
  const book = rows[0];

  const authorNames = (book.authors as { name: string }[]).map(a => a.name).join(', ') || 'Unknown';
  const tags = (book.tags as { name: string }[]).map(t => t.name).join(', ');
  const seriesLine = (book.series as { name: string; position: number | null }[]).length > 0
    ? `Part of the "${book.series[0].name}" series (book ${book.series[0].position ?? '?'})`
    : '';
  const ratingLine = book.user_book?.rating ? `The reader has rated this ${book.user_book.rating}/5 stars.` : '';

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'You are an expert science fiction and fantasy book reviewer with deep genre knowledge. Write in an enthusiastic, atmospheric style that makes readers want to pick up the book immediately.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Write an engaging 2-3 paragraph summary of "${book.title}" by ${authorNames} for a sci-fi and fantasy reader.
${book.description ? `\nPublisher description: ${book.description}` : ''}
${seriesLine ? `\n${seriesLine}` : ''}
${tags ? `\nGenres/themes: ${tags}` : ''}
${ratingLine ? `\n${ratingLine}` : ''}

Capture the book's atmosphere and unique appeal without spoiling major plot twists. Focus on tone, themes, and what makes it stand out in the SFF genre.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const summary = message.content.find(b => b.type === 'text')?.text ?? '';

  res.json({ summary, book_id: Number(book_id) });
}));

// ── POST /api/claude/next ─────────────────────────────────────────────────────

router.post('/next', asyncHandler(async (req, res) => {
  const userId = req.body.user_id ?? 1;

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
     ORDER BY ub.rating DESC NULLS LAST, ub.updated_at DESC
     LIMIT 25`,
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
    read.length ? `Books they've read:\n${read.slice(0, 12).map(fmt).join('\n')}` : '',
    reading.length ? `\nCurrently reading:\n${reading.map(fmt).join('\n')}` : '',
    wtr.length ? `\nWant to read:\n${wtr.slice(0, 5).map(fmt).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'You are a knowledgeable science fiction and fantasy book recommender. Respond ONLY with valid JSON — no markdown fences, no explanation outside the JSON object.',
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

router.post('/similar-authors', asyncHandler(async (req, res) => {
  const { author_id } = req.body;
  if (!author_id) return res.status(400).json({ error: 'author_id is required' });
  const userId = req.body.user_id ?? 1;

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
        text: 'You are an expert science fiction and fantasy literary critic with encyclopedic knowledge of authors and their styles. Respond ONLY with valid JSON — no markdown fences, no explanation outside the JSON object.',
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

export default router;
