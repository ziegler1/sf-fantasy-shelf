import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { generateAndStoreSummary } from '../lib/generateSummary';
import type { BookWithDetails, ReadingStatus } from '../types';

const router = Router();

// ── Enriched query helper ─────────────────────────────────────────────────────

function booksQuery(where = '', values: unknown[] = []) {
  return {
    text: `
      SELECT
        b.*,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', a.id, 'name', a.name, 'bio', a.bio,
            'website', a.website, 'image_url', a.image_url,
            'created_at', a.created_at, 'updated_at', a.updated_at,
            'role', ba.role
          )) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) AS authors,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', s.id, 'name', s.name, 'description', s.description,
            'created_at', s.created_at, 'updated_at', s.updated_at,
            'position', bs.position
          )) FILTER (WHERE s.id IS NOT NULL), '[]'
        ) AS series,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', t.id, 'name', t.name, 'created_at', t.created_at
          )) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) AS tags,
        CASE WHEN ub.id IS NOT NULL THEN jsonb_build_object(
          'id', ub.id, 'book_id', ub.book_id, 'status', ub.status,
          'rating', ub.rating, 'review', ub.review, 'notes', ub.notes,
          'started_at', ub.started_at, 'finished_at', ub.finished_at,
          'created_at', ub.created_at, 'updated_at', ub.updated_at
        ) ELSE NULL END AS user_book
      FROM books b
      LEFT JOIN book_authors ba ON ba.book_id = b.id
      LEFT JOIN authors a       ON a.id = ba.author_id
      LEFT JOIN book_series bs  ON bs.book_id = b.id
      LEFT JOIN series s        ON s.id = bs.series_id
      LEFT JOIN book_tags bt    ON bt.book_id = b.id
      LEFT JOIN tags t          ON t.id = bt.tag_id
      LEFT JOIN user_books ub   ON ub.book_id = b.id AND ub.user_id = 1
      ${where}
      GROUP BY b.id, ub.id
      ORDER BY b.title
    `,
    values,
  };
}

// ── POST /api/books/import  (Google Books → DB, author lookup-or-create) ──────
// Must be declared before /:id routes to avoid route conflict.

router.post('/import', asyncHandler(async (req, res) => {
  const {
    title, authors: authorNames = [], cover_url, published_at,
    page_count, isbn, isbn13, description, language = 'en',
    status,
  } = req.body as {
    title: string;
    authors: string[];
    cover_url?: string;
    published_at?: string;
    page_count?: number;
    isbn?: string;
    isbn13?: string;
    description?: string;
    language?: string;
    status?: ReadingStatus;
  };

  if (!title) return res.status(400).json({ error: 'title is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If a book with the same ISBN already exists, return it instead of duplicating
    if (isbn13 || isbn) {
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM books WHERE (isbn13 = $1 AND isbn13 IS NOT NULL)
                                 OR (isbn = $2 AND isbn IS NOT NULL) LIMIT 1`,
        [isbn13 ?? null, isbn ?? null],
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        const { rows } = await pool.query<BookWithDetails>(
          booksQuery('WHERE b.id = $1', [existing.rows[0].id]),
        );
        return res.status(200).json(rows[0]);
      }
    }

    // Insert the book
    const { rows: [book] } = await client.query(
      `INSERT INTO books (title, isbn, isbn13, description, cover_url, published_at, page_count, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, isbn ?? null, isbn13 ?? null, description ?? null,
       cover_url ?? null, published_at ?? null, page_count ?? null, language],
    );

    // Lookup-or-create each author
    for (const name of authorNames) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      let authorId: number;
      const found = await client.query<{ id: number }>(
        'SELECT id FROM authors WHERE LOWER(name) = LOWER($1) LIMIT 1', [trimmed],
      );
      if (found.rows.length) {
        authorId = found.rows[0].id;
      } else {
        const { rows: [a] } = await client.query<{ id: number }>(
          'INSERT INTO authors (name) VALUES ($1) RETURNING id', [trimmed],
        );
        authorId = a.id;
      }
      await client.query(
        'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [book.id, authorId, 'author'],
      );
    }

    // Optionally place on the user's shelf immediately
    if (status) {
      await client.query(
        `INSERT INTO user_books (user_id, book_id, status) VALUES (1, $1, $2)
         ON CONFLICT (user_id, book_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [book.id, status],
      );
    }

    await client.query('COMMIT');

    // Return enriched book
    const { rows } = await pool.query<BookWithDetails>(booksQuery('WHERE b.id = $1', [book.id]));
    res.status(201).json(rows[0]);

    // Background summary generation
    setImmediate(() => {
      generateAndStoreSummary(book.id).catch(err =>
        console.error(`Summary generation failed for book ${book.id}:`, err),
      );
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── GET /api/books  (?status=reading&search=dune) ─────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (req.query['status']) {
    values.push(req.query['status']);
    conditions.push(`ub.status = $${values.length}`);
  }
  if (req.query['search']) {
    values.push(`%${req.query['search']}%`);
    conditions.push(`b.title ILIKE $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<BookWithDetails>(booksQuery(where, values));
  res.json(rows);
}));

// ── GET /api/books/:id ────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<BookWithDetails>(
    booksQuery('WHERE b.id = $1', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/books ───────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const { title, isbn, isbn13, description, cover_url, published_at,
          page_count, language, author_ids, tag_ids, series: seriesLinks } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO books (title, isbn, isbn13, description, cover_url,
                          published_at, page_count, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, isbn ?? null, isbn13 ?? null, description ?? null,
       cover_url ?? null, published_at ?? null, page_count ?? null,
       language ?? 'en'],
    );
    const book = rows[0];

    if (Array.isArray(author_ids)) {
      for (const { author_id, role = 'author' } of author_ids) {
        await client.query(
          'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [book.id, author_id, role],
        );
      }
    }
    if (Array.isArray(tag_ids)) {
      for (const tag_id of tag_ids) {
        await client.query(
          'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [book.id, tag_id],
        );
      }
    }
    if (Array.isArray(seriesLinks)) {
      for (const { series_id, position = null } of seriesLinks) {
        await client.query(
          'INSERT INTO book_series (book_id, series_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [book.id, series_id, position],
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(book);

    // Generate and persist AI summary in the background — don't block the response
    setImmediate(() => {
      generateAndStoreSummary(book.id).catch(err =>
        console.error(`Summary generation failed for book ${book.id}:`, err),
      );
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── PUT /api/books/:id ────────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const { title, isbn, isbn13, description, cover_url,
          published_at, page_count, language } = req.body;

  const { rows } = await pool.query(
    `UPDATE books
     SET title=$1, isbn=$2, isbn13=$3, description=$4, cover_url=$5,
         published_at=$6, page_count=$7, language=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [title, isbn ?? null, isbn13 ?? null, description ?? null,
     cover_url ?? null, published_at ?? null, page_count ?? null,
     language ?? 'en', req.params['id']],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/books/:id ─────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM books WHERE id=$1', [req.params['id']]);
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

// ── PUT /api/books/:id/shelf  (upsert user_book) ──────────────────────────────

router.put('/:id/shelf', asyncHandler(async (req, res) => {
  const { status, rating, review, notes, started_at, finished_at } = req.body;

  const validStatuses: ReadingStatus[] = ['want-to-read', 'reading', 'read', 'dnf'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { rows } = await pool.query(
    `INSERT INTO user_books (user_id, book_id, status, rating, review, notes, started_at, finished_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, book_id) DO UPDATE SET
       status      = EXCLUDED.status,
       rating      = EXCLUDED.rating,
       review      = EXCLUDED.review,
       notes       = EXCLUDED.notes,
       started_at  = EXCLUDED.started_at,
       finished_at = EXCLUDED.finished_at,
       updated_at  = NOW()
     RETURNING *`,
    [req.params['id'], status ?? 'want-to-read', rating ?? null,
     review ?? null, notes ?? null, started_at ?? null, finished_at ?? null],
  );
  res.json(rows[0]);
}));

// ── DELETE /api/books/:id/shelf ───────────────────────────────────────────────

router.delete('/:id/shelf', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM user_books WHERE book_id=$1', [req.params['id']]);
  res.status(204).send();
}));

export default router;
