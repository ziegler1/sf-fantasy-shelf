import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';

const router = Router();

router.use(verifyToken);

// ── GET /api/upcoming ─────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM upcoming_releases
     WHERE user_id = $1
     ORDER BY release_date ASC NULLS LAST, created_at ASC`,
    [req.userId],
  );
  res.json(rows);
}));

// ── POST /api/upcoming ────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const { title, author_name, release_date, isbn, cover_url, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const { rows } = await pool.query(
    `INSERT INTO upcoming_releases (user_id, title, author_name, release_date, isbn, cover_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.userId, title, author_name ?? null, release_date ?? null,
     isbn ?? null, cover_url ?? null, notes ?? null],
  );
  res.status(201).json(rows[0]);
}));

// ── DELETE /api/upcoming/:id ──────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'DELETE FROM upcoming_releases WHERE id = $1 AND user_id = $2',
    [req.params['id'], req.userId],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

export default router;
