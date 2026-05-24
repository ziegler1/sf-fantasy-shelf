import { Router } from 'express';
import { z } from 'zod';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { validate, requiredStr, nullableStr } from '../lib/validate';
import type { SeriesWithBooks } from '../types';

const seriesSchema = z.object({
  name:        requiredStr(255),
  description: nullableStr(5000),
});

const router = Router();

router.use(verifyToken);

// ── Enriched query helper ─────────────────────────────────────────────────────
// $1 is always userId — only returns series where the user owns at least one book.
// extraValues are appended starting at $2 and referenced in extraWhere.

function seriesQuery(userId: number, extraWhere = '', extraValues: unknown[] = []) {
  const values: unknown[] = [userId, ...extraValues];
  return {
    text: `
      SELECT
        s.*,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', b.id, 'title', b.title, 'cover_url', b.cover_url,
              'published_at', b.published_at, 'description', b.description,
              'isbn', b.isbn, 'isbn13', b.isbn13, 'page_count', b.page_count,
              'language', b.language, 'created_at', b.created_at,
              'updated_at', b.updated_at, 'position', bs.position
            ) ORDER BY bs.position NULLS LAST, b.title
          ) FILTER (WHERE b.id IS NOT NULL), '[]'
        ) AS books
      FROM series s
      LEFT JOIN book_series bs ON bs.series_id = s.id
      LEFT JOIN books b        ON b.id = bs.book_id
      WHERE EXISTS (
        SELECT 1 FROM book_series bs2
        JOIN user_books ub ON ub.book_id = bs2.book_id
        WHERE bs2.series_id = s.id AND ub.user_id = $1
      )
      ${extraWhere}
      GROUP BY s.id
      ORDER BY s.name
    `,
    values,
  };
}

// ── GET /api/series ───────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<SeriesWithBooks>(seriesQuery(req.userId));
  res.json(rows);
}));

// ── GET /api/series/:id ───────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<SeriesWithBooks>(
    seriesQuery(req.userId, 'AND s.id = $2', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/series ──────────────────────────────────────────────────────────

router.post('/', validate(seriesSchema), asyncHandler(async (req, res) => {
  const { name, description } = req.body as z.infer<typeof seriesSchema>;

  const { rows } = await pool.query(
    'INSERT INTO series (name, description) VALUES ($1,$2) RETURNING *',
    [name, description ?? null],
  );
  res.status(201).json(rows[0]);
}));

// ── PUT /api/series/:id ───────────────────────────────────────────────────────

router.put('/:id', validate(seriesSchema), asyncHandler(async (req, res) => {
  const { name, description } = req.body as z.infer<typeof seriesSchema>;

  const { rows } = await pool.query(
    `UPDATE series SET name=$1, description=$2, updated_at=NOW()
     WHERE id=$3 RETURNING *`,
    [name, description ?? null, req.params['id']],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── DELETE /api/series/:id ────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM series WHERE id=$1', [req.params['id']]);
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

// ── DELETE /api/series/:id/books/:bookId ──────────────────────────────────────

router.delete('/:id/books/:bookId', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'DELETE FROM book_series WHERE series_id=$1 AND book_id=$2',
    [req.params['id'], req.params['bookId']],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

export default router;
