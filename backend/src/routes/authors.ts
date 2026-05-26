import { Router } from 'express';
import { z } from 'zod';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { validate, requiredStr, nullableStr } from '../lib/validate';
import type { AuthorWithBooks } from '../types';

const authorSchema = z.object({
  name:      requiredStr(255),
  bio:       nullableStr(5000),
  website:   nullableStr(500),
  image_url: nullableStr(2048),
});

const restoreSchema = z.object({
  name:     requiredStr(255),
  book_ids: z.array(z.number().int().positive()).min(1).max(500),
});

const router = Router();

router.use(verifyToken);

// ── Enriched query helper ─────────────────────────────────────────────────────

function authorsQuery(userId: number, where = '', extraValues: unknown[] = []) {
  const values = [...extraValues, userId];
  const userParam = `$${values.length}`;
  return {
    text: `
      SELECT
        a.*,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', b.id, 'title', b.title, 'cover_url', b.cover_url,
            'published_at', b.published_at, 'description', b.description,
            'isbn', b.isbn, 'isbn13', b.isbn13, 'page_count', b.page_count,
            'language', b.language, 'created_at', b.created_at,
            'updated_at', b.updated_at
          )) FILTER (WHERE b.id IS NOT NULL), '[]'
        ) AS books,
        EXISTS(
          SELECT 1 FROM author_follows af
          WHERE af.author_id = a.id AND af.user_id = ${userParam}
        ) AS followed
      FROM authors a
      LEFT JOIN book_authors ba ON ba.author_id = a.id
      LEFT JOIN books b         ON b.id = ba.book_id
      ${where}
      GROUP BY a.id
      ORDER BY a.name
    `,
    values,
  };
}

// ── POST /api/authors/restore ─────────────────────────────────────────────────
// Re-creates a deleted author and links them to the specified books (owned by
// this user). Safe to call even if the author already exists — uses find-or-create.

router.post('/restore', validate(restoreSchema), asyncHandler(async (req, res) => {
  const { name, book_ids } = req.body as z.infer<typeof restoreSchema>;
  const userId = req.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Only link books actually owned by this user
    const { rows: owned } = await client.query<{ book_id: number }>(
      `SELECT book_id FROM user_books WHERE user_id = $1 AND book_id = ANY($2::int[])`,
      [userId, book_ids],
    );
    const ownedIds = owned.map(r => r.book_id);

    // Find or create author (same normalisation as import)
    const found = await client.query<{ id: number }>(
      `SELECT id FROM authors
       WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
           = LOWER(REGEXP_REPLACE($1,   '[^a-zA-Z0-9]', '', 'g'))
       LIMIT 1`,
      [name.trim()],
    );
    let authorId: number;
    if (found.rows.length) {
      authorId = found.rows[0].id;
    } else {
      const { rows: [a] } = await client.query<{ id: number }>(
        'INSERT INTO authors (name) VALUES ($1) RETURNING id',
        [name.trim()],
      );
      authorId = a.id;
    }

    for (const bookId of ownedIds) {
      await client.query(
        'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [bookId, authorId, 'author'],
      );
    }

    await client.query('COMMIT');
    res.json({ author_id: authorId, linked: ownedIds.length });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ── GET /api/authors ──────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<AuthorWithBooks>(authorsQuery(req.userId));
  res.json(rows);
}));

// ── GET /api/authors/:id ──────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<AuthorWithBooks>(
    authorsQuery(req.userId, 'WHERE a.id = $1', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/authors ─────────────────────────────────────────────────────────

router.post('/', validate(authorSchema), asyncHandler(async (req, res) => {
  const { name, bio, website, image_url } = req.body as z.infer<typeof authorSchema>;

  const { rows } = await pool.query(
    `INSERT INTO authors (name, bio, website, image_url) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, bio ?? null, website ?? null, image_url ?? null],
  );
  res.status(201).json(rows[0]);
}));

// ── PUT /api/authors/:id ──────────────────────────────────────────────────────

router.put('/:id', validate(authorSchema), asyncHandler(async (req, res) => {
  const { name, bio, website, image_url } = req.body as z.infer<typeof authorSchema>;

  const { rows } = await pool.query(
    `UPDATE authors SET name=$1, bio=$2, website=$3, image_url=$4, updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [name, bio ?? null, website ?? null, image_url ?? null, req.params['id']],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/authors/:id ───────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM authors WHERE id=$1', [req.params['id']]);
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

// ── POST /api/authors/:id/follow ──────────────────────────────────────────────

router.post('/:id/follow', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO author_follows (user_id, author_id) VALUES ($1, $2)
     ON CONFLICT (user_id, author_id) DO NOTHING RETURNING *`,
    [req.userId, req.params['id']],
  );
  res.status(rows.length ? 201 : 200).json({ followed: true });
}));

// ── DELETE /api/authors/:id/follow ────────────────────────────────────────────

router.delete('/:id/follow', asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM author_follows WHERE user_id=$1 AND author_id=$2',
    [req.userId, req.params['id']],
  );
  res.status(204).send();
}));

export default router;
