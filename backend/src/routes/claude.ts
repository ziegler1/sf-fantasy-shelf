import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { generateAndStoreSummary } from '../lib/generateSummary';

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

  const summary = await generateAndStoreSummary(Number(book_id));
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
