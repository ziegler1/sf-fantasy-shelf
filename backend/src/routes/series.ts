import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import type { SeriesWithBooks } from '../types';

const router = Router();

router.use(verifyToken);

// ── Enriched query helper ─────────────────────────────────────────────────────

function seriesQuery(where = '', values: unknown[] = []) {
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
      ${where}
      GROUP BY s.id
      ORDER BY s.name
    `,
    values,
  };
}

// ── GET /api/series ───────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query<SeriesWithBooks>(seriesQuery());
  res.json(rows);
}));

// ── GET /api/series/:id ───────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<SeriesWithBooks>(
    seriesQuery('WHERE s.id = $1', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/series ──────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await pool.query(
    'INSERT INTO series (name, description) VALUES ($1,$2) RETURNING *',
    [name, description ?? null],
  );
  res.status(201).json(rows[0]);
}));

// ── PUT /api/series/:id ───────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, description } = req.body;

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

export default router;
