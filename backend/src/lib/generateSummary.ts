import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
const MODEL = 'claude-sonnet-4-5';

export async function generateAndStoreSummary(bookId: number): Promise<string> {
  // Return cached summary immediately if present
  const cached = await pool.query<{ ai_summary: string | null }>(
    'SELECT ai_summary FROM books WHERE id = $1',
    [bookId],
  );
  if (cached.rows[0]?.ai_summary) return cached.rows[0].ai_summary;

  // Fetch full book details for the prompt
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
    [bookId],
  );

  if (!rows.length) throw new Error(`Book ${bookId} not found`);
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

  // Persist so future calls skip Claude entirely
  await pool.query('UPDATE books SET ai_summary = $1 WHERE id = $2', [summary, bookId]);

  return summary;
}
