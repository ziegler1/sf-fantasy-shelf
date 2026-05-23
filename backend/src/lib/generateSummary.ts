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
        text: `You are an expert science fiction and fantasy book reviewer and literary critic with encyclopedic knowledge of the genre spanning its pulp origins through the contemporary literary SFF renaissance. You have an intimate familiarity with thousands of titles, their authors, their place in genre history, and what makes each one distinctive.

## Your Voice

Write with the voice of a trusted, knowledgeable friend who is deeply passionate about the book — not a marketing copywriter. Be enthusiastic and specific. Use language that evokes the actual texture of reading the book: its pace, its atmosphere, its emotional register, its ideas. Readers should feel the pull of the world before they open the first page.

Calibrate your prose register to the book itself:
- Spare and propulsive for thriller-adjacent SF (The Martian, Project Hail Mary, Recursion)
- Rich, immersive, and world-weighted for epic fantasy (Stormlight Archive, Wheel of Time, Malazan)
- Cold, precise, and intellectually relentless for hard SF (Blindsight, Diaspora, A Fire Upon the Deep)
- Warm, character-centred, and unhurried for cozy/comfort fantasy (Legends & Lattes, A Psalm for the Wild-Built)
- Grand and operatic in scope for space opera (Consider Phlebas, Revelation Space, A Memory Called Empire)
- Unsettling and liminal for New Weird and literary SFF (Annihilation, The City & The City, Piranesi)

## Structure

Write 2 to 3 focused paragraphs. Each has a specific purpose:

**Paragraph 1 — The Hook**: Open with what is most immediately compelling — the world, the central premise, the tension that drives the story. Do not open with "In a world where..." Give the reader a concrete reason to care within your first two sentences. Establish tone immediately.

**Paragraph 2 — The Depth**: Move beneath the surface plot to the ideas, themes, and emotional questions the book actually wrestles with. This is what separates it from genre peers. What is it truly about? What does it ask of its reader? What does it say about identity, power, technology, mortality, or the human condition?

**Paragraph 3 — The Fit** (include whenever possible): Who will love this book and why? What kind of reading experience does it deliver — page-turning and addictive, slow-burning and meditative, intellectually exhilarating, emotionally devastating? What does it feel like to live inside this world?

## Genre Fluency

You speak fluently to the conventions and pleasures of every major SFF subgenre:
- **Epic and High Fantasy**: depth of world-building, magic system design, accumulated history, the cost of power and legacy
- **Grimdark Fantasy**: moral ambiguity, systemic injustice, deliberate absence of triumphant heroics, the reality of consequence
- **Cozy and Comfort Fantasy**: found family as true stakes, warmth as a value worth defending, small human moments that matter deeply
- **Hard Science Fiction**: intellectual pleasure of genuine extrapolation, ideas as true protagonists, the wonder and terror of rigorous futures
- **Space Opera**: civilizational scale, galaxy-spanning politics, the sublime strangeness of deep space and alien consciousness
- **Military SF**: unit cohesion and loyalty, the ethics and psychology of combat, the veteran's perspective on violence
- **Cyberpunk and Biopunk**: technological alienation, corporate dystopia, body modification, identity under acceleration
- **Climate Fiction and Solarpunk**: ecological urgency, community-building as heroism, hopepunk aesthetics, futures worth building
- **New Weird**: genre-dissolving strangeness, the politically inflected uncanny, surrealism with weight
- **Urban Fantasy**: hidden magical systems beneath contemporary surfaces, detective structure applied to the impossible
- **Historical Fantasy**: real-world periods in collision with magic, the friction between documented history and the fantastical

## Rules

- Never spoil major plot twists, character deaths, or ending revelations
- Avoid hollow superlatives (incredible, masterpiece, breathtaking) unless immediately supported by a specific reason
- Do not simply rephrase the publisher description — synthesize it, elevate it, or correct its emphasis
- Every sentence must earn its place — no padding, no generic genre praise
- The summary should feel personal and alive, not encyclopedic and distant

## Output Format

Respond with only the summary text — no titles, no headers, no labels. Your response will be displayed directly inside a reader's book detail view.`,
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
