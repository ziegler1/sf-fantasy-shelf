import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import type { AuthorWithBooks } from '../types';

const router = Router();

// ── Enriched query helper ─────────────────────────────────────────────────────

function authorsQuery(where = '', values: unknown[] = []) {
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
          SELECT 1 FROM author_follows af WHERE af.author_id = a.id
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

// ── GET /api/authors ──────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query<AuthorWithBooks>(authorsQuery());
  res.json(rows);
}));

// ── GET /api/authors/:id ──────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<AuthorWithBooks>(
    authorsQuery('WHERE a.id = $1', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/authors ─────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const { name, bio, website, image_url } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await pool.query(
    `INSERT INTO authors (name, bio, website, image_url)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, bio ?? null, website ?? null, image_url ?? null],
  );
  res.status(201).json(rows[0]);
}));

// ── PUT /api/authors/:id ──────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, bio, website, image_url } = req.body;

  const { rows } = await pool.query(
    `UPDATE authors
     SET name=$1, bio=$2, website=$3, image_url=$4, updated_at=NOW()
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
    `INSERT INTO author_follows (user_id, author_id) VALUES (1, $1)
     ON CONFLICT (user_id, author_id) DO NOTHING RETURNING *`,
    [req.params['id']],
  );
  res.status(rows.length ? 201 : 200).json({ followed: true });
}));

// ── DELETE /api/authors/:id/follow ────────────────────────────────────────────

router.delete('/:id/follow', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM author_follows WHERE author_id=$1', [req.params['id']]);
  res.status(204).send();
}));

export default router;
